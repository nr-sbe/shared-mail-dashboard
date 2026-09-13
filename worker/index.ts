import { Resend } from 'resend';
import { isSetupMessage, parseSources, readableBody, RETENTION_MS } from './core';

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_WEBHOOK_SECRET: string;
  SOURCES_JSON: string;
  ALLOWED_ORIGIN: string;
}

interface Row {
  id: string; source_id: string; source_label: string; sender: string;
  subject: string; body: string; received_at: number; expires_at: number;
}

function message(row: Row) {
  return {
    id: row.id, sourceId: row.source_id, sourceLabel: row.source_label,
    sender: row.sender, subject: row.subject, body: row.body,
    receivedAt: new Date(row.received_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}

async function receive(request: Request, env: Env): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET || !env.RESEND_API_KEY) return json({ error: 'Receiving is not configured.' }, 503);
  const raw = await request.text();
  if (raw.length > 128_000) return json({ error: 'Event too large.' }, 413);
  const resend = new Resend(env.RESEND_API_KEY);
  let event;
  try {
    event = resend.webhooks.verify({
      payload: raw,
      headers: {
        id: request.headers.get('svix-id') || '',
        timestamp: request.headers.get('svix-timestamp') || '',
        signature: request.headers.get('svix-signature') || '',
      },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return json({ error: 'Invalid signature.' }, 401);
  }
  if (event.type !== 'email.received') return json({ ignored: true });
  const sources = parseSources(env.SOURCES_JSON);
  // Gmail forwarding preserves the original To header. Route by SMTP recipients.
  const recipients = (event.data.received_for ?? event.data.to).map(address => address.toLowerCase());
  const candidates = sources.filter(s => s.active && recipients.includes(s.address.toLowerCase()));
  if (!candidates.length || isSetupMessage(event.data.from, event.data.subject)) return json({ ignored: true });

  const providerId = event.data.email_id;
  const now = Date.now();
  const removed = await env.DB.prepare('SELECT provider_id FROM removed_messages WHERE provider_id = ? AND expires_at > ?')
    .bind(providerId, now).first();
  if (removed) return json({ ignored: true });
  const existing = await env.DB.prepare('SELECT source_id FROM messages WHERE provider_id = ?').bind(providerId).all<{ source_id: string }>();
  const pending = candidates.filter(s => !existing.results.some(row => row.source_id === s.id));
  if (!pending.length) return json({ received: true });

  const { data, error } = await resend.emails.receiving.get(providerId);
  if (error || !data) {
    // Do not acknowledge a transient failure: Resend must retry the event.
    console.error('Email retrieval failed', { providerId, errorName: error?.name });
    return json({ error: 'Could not retrieve the message. Please retry.' }, 503);
  }
  const receivedAt = Date.parse(data.created_at);
  if (!Number.isFinite(receivedAt) || receivedAt > now + 300_000) return json({ error: 'Invalid received time.' }, 422);
  if (receivedAt + RETENTION_MS <= now || isSetupMessage(data.from, data.subject)) return json({ ignored: true });
  const matched = pending.filter(s => receivedAt >= Date.parse(s.activeSince!));
  if (!matched.length) return json({ ignored: true });
  // Reject oversize bodies explicitly instead of silently publishing truncated mail.
  if ((data.text?.length || 0) > 1_000_000 || (data.html?.length || 0) > 1_000_000) {
    console.error('Message exceeds body limit', { providerId });
    return json({ error: 'Message body exceeds the supported size.' }, 422);
  }
  const body = readableBody(data.text, data.html);
  await env.DB.batch(matched.map(s => env.DB.prepare(`
    INSERT OR IGNORE INTO messages
      (id, provider_id, source_id, source_label, sender, subject, body, received_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(`${providerId}:${s.id}`, providerId, s.id, s.label, data.from, data.subject, body, receivedAt, receivedAt + RETENTION_MS)));
  return json({ received: true });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/webhooks/resend' && request.method === 'POST') return receive(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  if (url.pathname === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, serverTime: new Date().toISOString() });
  }
  const now = Date.now();
  const sources = parseSources(env.SOURCES_JSON).filter(s => s.active);
  const activeIds = new Set(sources.map(s => s.id));
  if (url.pathname === '/api/messages') {
    const rows = await env.DB.prepare('SELECT * FROM messages WHERE expires_at > ? ORDER BY received_at DESC, id ASC').bind(now).all<Row>();
    return json({ messages: rows.results.filter(r => activeIds.has(r.source_id)).map(message),
      sources: sources.map(({ id, label }) => ({ id, label })), serverTime: new Date(now).toISOString() });
  }
  if (url.pathname.startsWith('/api/messages/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/messages/'.length));
    const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ? AND expires_at > ?').bind(id, now).first<Row>();
    return row && activeIds.has(row.source_id) ? json(message(row)) : json({ error: 'Message not found or expired.' }, 404);
  }
  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response;
    if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
    else {
      try { response = await route(request, env); }
      catch (error) {
        console.error('Request failed', { errorName: error instanceof Error ? error.name : 'Unknown' });
        response = json({ error: 'Mail is temporarily unavailable. Try refreshing shortly.' }, 503);
      }
    }
    const headers = new Headers(response.headers);
    // CORS is browser compatibility, not authentication: the read API is public.
    if (request.headers.get('Origin') === env.ALLOWED_ORIGIN) headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM messages WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM removed_messages WHERE expires_at <= ?').bind(now),
    ]);
  },
} satisfies ExportedHandler<Env>;
