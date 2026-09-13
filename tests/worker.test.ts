import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { isSetupMessage, parseSources, readableBody, RETENTION_MS } from '../worker/core';
import worker from '../worker/index';

const secretBytes = Buffer.from('fictional-test-secret-for-webhooks');
const secret = `whsec_${secretBytes.toString('base64')}`;
const source = { id: 'one', label: 'Source One', address: 'secret-one@example.resend.app', active: true, activeSince: new Date(Date.now() - 86400000).toISOString() };
const sources = [source, { ...source, id: 'two', label: 'Source Two', address: 'secret-two@example.resend.app' }, { ...source, id: 'paused', address: 'paused@example.resend.app', active: false }];
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const incoming = new Map<string, Record<string, unknown>>();
let upstreamFailure = false;
let upstreamCalls = 0;
const password = 'fictional-test-password';
let cookie = '';

async function login(value = password, ip = '192.0.2.1', origin = 'https://worker.test') {
  return mf.dispatchFetch('https://worker.test/login', { method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
    body: new URLSearchParams({ password: value }).toString() });
}

function email(id = 'email-1', overrides: Record<string, unknown> = {}) {
  return { object: 'email', id, to: [source.address], from: 'Dispatch <dispatch@example.com>', subject: 'Delivery update',
    text: 'Arriving at 10 AM.', html: null, created_at: new Date().toISOString(), message_id: `<${id}@example.com>`,
    cc: [], bcc: [], reply_to: [], received_for: [source.address], headers: {}, attachments: [{ id: 'attachment', filename: 'private.pdf' }], ...overrides };
}
function deliver(data: ReturnType<typeof email>, options: { signature?: string; timeOffset?: number } = {}) {
  incoming.set(data.id, data);
  const payload = JSON.stringify({ type: 'email.received', created_at: data.created_at, data: { email_id: data.id, to: data.to, received_for: data.received_for, from: data.from, subject: data.subject } });
  const timestamp = String(Math.floor(Date.now() / 1000) + (options.timeOffset || 0));
  const eventId = 'event-for-' + data.id;
  const signature = createHmac('sha256', secretBytes).update(`${eventId}.${timestamp}.${payload}`).digest('base64');
  return mf.dispatchFetch('https://worker.test/webhooks/resend', { method: 'POST', body: payload, headers: {
    'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': options.signature ?? `v1,${signature}`,
  } });
}
async function feed() { return (await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Cookie: cookie } })).json() as Promise<{ messages: Record<string, unknown>[]; sources: unknown[] }>; }

beforeAll(async () => {
  const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], cf: false,
    d1Databases: ['DB'], bindings: { RESEND_API_KEY: 're_fictional', RESEND_WEBHOOK_SECRET: secret, SOURCES_JSON: JSON.stringify(sources), DASHBOARD_PASSWORD: password, DASHBOARD_SESSION_KEY: 'independent-fictional-session-secret' },
    serviceBindings: { ASSETS: async () => new RuntimeResponse('<html>Private dashboard</html>', { headers: { 'Content-Type': 'text/html' } }) },
    outboundService: async request => {
      const url = new URL(request.url); upstreamCalls++;
      if (url.origin !== 'https://api.resend.com' || !url.pathname.startsWith('/emails/receiving/')) return new RuntimeResponse('Unexpected network request', { status: 500 });
      if (upstreamFailure) return RuntimeResponse.json({ name: 'application_error', message: 'Unavailable' }, { status: 503 });
      const data = incoming.get(url.pathname.split('/').pop()!);
      return data ? RuntimeResponse.json(data) : RuntimeResponse.json({ name: 'not_found', message: 'Not found' }, { status: 404 });
    },
  }));
  await mf.ready;
  db = await mf.getD1Database('DB');
  const sql = ['0001_messages.sql', '0002_auth.sql'].map(f => readFileSync(`migrations/${f}`, 'utf8')).join('\n').replace(/--[^\n]*/g, '');
  for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
}, 30000);

beforeEach(async () => {
  incoming.clear(); upstreamFailure = false; upstreamCalls = 0;
  await db.batch(['messages', 'removed_messages', 'auth_sessions', 'login_attempts'].map(table => db.prepare(`DELETE FROM ${table}`)));
  const response = await login();
  expect(response.status).toBe(303);
  cookie = response.headers.get('Set-Cookie')!.split(';')[0];
});
afterAll(async () => { if (mf) await mf.dispose(); });

describe('Email processing against the Cloudflare runtime and D1', () => {
  it('stores only body/metadata and publishes to two independent viewers', async () => {
    expect((await deliver(email())).status).toBe(200);
    const [a, b] = await Promise.all([feed(), feed()]);
    expect(a.messages).toHaveLength(1); expect(b.messages).toEqual(a.messages);
    expect(a.messages[0]).toMatchObject({ subject: 'Delivery update', sourceLabel: 'Source One', body: 'Arriving at 10 AM.' });
    expect(JSON.stringify(a)).not.toMatch(/private\.pdf|secret-one|provider_id|re_fictional/);
    expect(upstreamCalls).toBe(1);
  });
  it('rejects invalid and stale signatures without fetching mail', async () => {
    expect((await deliver(email(), { signature: 'v1,invalid' })).status).toBe(401);
    expect((await deliver(email(), { timeOffset: -1000 })).status).toBe(401);
    expect(upstreamCalls).toBe(0); expect((await feed()).messages).toHaveLength(0);
  });
  it('ignores unconfigured and inactive recipients', async () => {
    await deliver(email('unknown', { received_for: ['unknown@example.resend.app'] }));
    await deliver(email('paused', { received_for: ['paused@example.resend.app'] }));
    expect(upstreamCalls).toBe(0); expect((await feed()).messages).toHaveLength(0);
  });
  it('keeps forwarding verification private even on an active source', async () => {
    await deliver(email('verification', { from: 'forwarding-noreply@google.com', subject: 'Gmail Forwarding Confirmation', text: 'Secret verification code' }));
    expect(upstreamCalls).toBe(0); expect((await feed()).messages).toHaveLength(0);
  });
  it('ignores messages received before activation and messages older than 72 hours', async () => {
    await deliver(email('before-activation', { created_at: new Date(Date.now() - 2 * 86400000).toISOString() }));
    await deliver(email('expired', { created_at: new Date(Date.now() - RETENTION_MS - 1000).toISOString() }));
    expect((await feed()).messages).toHaveLength(0);
  });
  it('deduplicates repeat and concurrent events', async () => {
    const data = email();
    await Promise.all([deliver(data), deliver(data)]);
    await deliver(data);
    expect((await feed()).messages).toHaveLength(1);
  });
  it('retains source identity for copies received by different accounts', async () => {
    await deliver(email('one', { to: [source.address] }));
    await deliver(email('two', { received_for: [sources[1].address] }));
    expect((await feed()).messages.map(m => m.sourceId).sort()).toEqual(['one', 'two']);
  });
  it('returns a retryable error then recovers without duplicate data', async () => {
    upstreamFailure = true;
    expect((await deliver(email())).status).toBe(503);
    expect((await feed()).messages).toHaveLength(0);
    upstreamFailure = false;
    expect((await deliver(email())).status).toBe(200);
    expect((await feed()).messages).toHaveLength(1);
  });
  it('routes Gmail forwards by the actual recipient, not the preserved To header', async () => {
    await deliver(email('forwarded', { to: ['owner@gmail.com'], received_for: [sources[1].address] }));
    expect((await feed()).messages[0].sourceId).toBe('two');
  });
  it('expires list and detail access before the cleanup job runs', async () => {
    await deliver(email());
    await db.prepare('UPDATE messages SET expires_at = ?').bind(Date.now() - 1).run();
    expect((await feed()).messages).toHaveLength(0);
    expect((await mf.dispatchFetch('https://worker.test/api/messages/email-1:one', { headers: { Cookie: cookie } })).status).toBe(404);
    const env = await mf.getBindings();
    await worker.scheduled({} as never, env as never);
    expect(await db.prepare('SELECT count(*) AS n FROM messages').first('n')).toBe(0);
  });
  it('cannot restore a deliberately removed message by replaying it', async () => {
    await deliver(email());
    await db.batch([db.prepare('DELETE FROM messages'), db.prepare('INSERT INTO removed_messages VALUES (?, ?)').bind('email-1', Date.now() + RETENTION_MS)]);
    await deliver(email());
    expect((await feed()).messages).toHaveLength(0);
  });
  it('publishes safe readable text for HTML-only messages without attachments or scripts', async () => {
    await deliver(email('html', { text: null, html: '<p>Hello <b>team</b>.</p><script>steal()</script><img src="https://tracker.example/pixel"><p><a href="https://example.com/status">Status page</a></p>' }));
    const body = (await feed()).messages[0].body;
    expect(body).toContain('Hello team.'); expect(body).toContain('https://example.com/status');
    expect(body).not.toMatch(/steal|tracker|<script|private\.pdf/);
  });
  it('handles empty mail and quotes without SQL injection', async () => {
    await deliver(email('empty', { text: '', subject: "'; DROP TABLE messages; --" }));
    expect((await feed()).messages[0].body).toBe('');
    expect((await feed()).messages[0].subject).toContain('DROP TABLE');
  });
  it('serves uncached authenticated reads without cross-origin permissions', async () => {
    const a = await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Cookie: cookie } });
    expect(a.status).toBe(200);
    expect(a.headers.get('cache-control')).toBe('no-store');
    expect(a.headers.get('access-control-allow-origin')).toBeNull();
    const b = await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Origin: 'https://other.example' } });
    expect(b.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('Shared password access', () => {
  it('protects list, detail, and static assets while leaving signed receiving operational', async () => {
    await deliver(email());
    for (const path of ['/api/messages', '/api/messages/email-1:one']) {
      const response = await mf.dispatchFetch(`https://worker.test${path}`);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('Arriving');
    }
    for (const path of ['/', '/index.html', '/assets/app.js']) {
      const response = await mf.dispatchFetch(`https://worker.test${path}`, { redirect: 'manual' });
      expect(response.status).toBe(303); expect(response.headers.get('Location')).toBe('/login');
    }
    expect((await mf.dispatchFetch('https://worker.test/', { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await feed()).messages).toHaveLength(1);
  });
  it('rejects wrong passwords and cross-origin login and sets secure session cookies', async () => {
    expect((await login('incorrect')).status).toBe(401);
    expect((await login(password, '192.0.2.1', 'https://evil.test')).status).toBe(403);
    const response = await login();
    expect(response.status).toBe(303);
    expect(response.headers.get('Set-Cookie')).toMatch(/__Host-shared_mail=.*; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
    const serialized = JSON.stringify((await db.prepare('SELECT * FROM auth_sessions').all()).results);
    expect(serialized).not.toContain(cookie.split('=')[1]);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(createHash('sha256').update(password).digest('hex'));
  });
  it('rate limits repeated attempts atomically, without blocking a different network', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => login('wrong', '192.0.2.90')));
    expect(responses.filter(r => r.status === 401)).toHaveLength(10);
    expect(responses.filter(r => r.status === 429)).toHaveLength(2);
    expect((await login(password, '192.0.2.90')).status).toBe(429);
    expect((await login(password, '192.0.2.91')).status).toBe(303);
  });
  it('rejects forged, expired, revoked, and password-rotation sessions', async () => {
    expect((await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Cookie: '__Host-shared_mail=' + 'f'.repeat(64) } })).status).toBe(401);
    const env = await mf.getBindings();
    const rotated = await worker.fetch(new Request('https://worker.test/api/messages', { headers: { Cookie: cookie } }), { ...env, DASHBOARD_PASSWORD: 'new-fictional-password' } as never);
    expect(rotated.status).toBe(401);
    await db.prepare('UPDATE auth_sessions SET expires_at = ?').bind(Date.now() - 1).run();
    expect((await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Cookie: cookie } })).status).toBe(401);
    cookie = (await login()).headers.get('Set-Cookie')!.split(';')[0];
    expect((await mf.dispatchFetch('https://worker.test/logout', { method: 'POST', headers: { Origin: 'https://evil.test', Cookie: cookie }, redirect: 'manual' })).status).toBe(403);
    const out = await mf.dispatchFetch('https://worker.test/logout', { method: 'POST', headers: { Origin: 'https://worker.test', Cookie: cookie }, redirect: 'manual' });
    expect(out.status).toBe(303); expect(out.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await mf.dispatchFetch('https://worker.test/api/messages', { headers: { Cookie: cookie } })).status).toBe(401);
  });
  it('fails closed when secrets are missing and rejects oversized login bodies', async () => {
    const env = await mf.getBindings();
    for (const secret of ['DASHBOARD_PASSWORD', 'DASHBOARD_SESSION_KEY']) {
      expect((await worker.fetch(new Request('https://worker.test/api/messages', { headers: { Cookie: cookie } }), { ...env, [secret]: '' } as never)).status).toBe(401);
    }
    const response = await mf.dispatchFetch('https://worker.test/login', { method: 'POST', headers: { Origin: 'https://worker.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + 'a'.repeat(3000) });
    expect(response.status).toBe(413);
  });
});

describe('Configuration and text conversion', () => {
  it('rejects duplicate source configuration and active sources without activation time', () => {
    expect(() => parseSources(JSON.stringify([source, source]))).toThrow();
    expect(() => parseSources(JSON.stringify([{ ...source, activeSince: null }]))).toThrow();
    expect(parseSources('[]')).toEqual([]);
  });
  it('uses complete plain text when provided and removes null bytes', () => {
    expect(readableBody('Hello\r\n\u0000team', '<p>Different</p>')).toBe('Hello\nteam');
    expect(isSetupMessage('sender@example.com', 'Gmail Forwarding Confirmation')).toBe(true);
  });
});
