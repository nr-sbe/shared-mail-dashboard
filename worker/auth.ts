import { timingSafeEqual } from 'node:crypto';

export interface AuthEnv {
  DB: D1Database;
  DASHBOARD_PASSWORD: string;
  DASHBOARD_SESSION_KEY: string;
}

const COOKIE = '__Host-shared_mail';
const SESSION_MS = 7 * 86400000;
const encoder = new TextEncoder();

export async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function privateDigest(value: string, env: AuthEnv): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.DASHBOARD_SESSION_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const result = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(result, b => b.toString(16).padStart(2, '0')).join('');
}

function token(request: Request): string | undefined {
  const value = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

export async function session(request: Request, env: AuthEnv): Promise<number | null> {
  if (!env.DASHBOARD_PASSWORD || !env.DASHBOARD_SESSION_KEY) return null;
  const value = token(request);
  if (!value) return null;
  const row = await env.DB.prepare('SELECT expires_at FROM auth_sessions WHERE token_hash = ? AND password_version = ? AND expires_at > ?')
    .bind(await digest(value), await privateDigest(`version:${env.DASHBOARD_PASSWORD}`, env), Date.now()).first<{ expires_at: number }>();
  return row?.expires_at ?? null;
}

function redirect(path: string, cookie?: string): Response {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

export function loginPage(message = '', status = 200): Response {
  // All interpolated messages are fixed server strings, never request values.
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in · Shared Mail</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6f8;color:#102438;font:16px/1.6 system-ui,sans-serif;padding:24px}.card{width:100%;max-width:430px;background:white;border:1px solid #dce5eb;border-radius:20px;padding:36px;box-shadow:0 12px 40px #1024380c}.brand{font-size:19px;font-weight:700;color:#176d68}h1{font-size:29px;line-height:1.2;margin:24px 0 12px}p{color:#526478}label{display:block;font-weight:600;margin-top:24px}input,button{font:inherit;width:100%;border-radius:8px;padding:12px;margin-top:8px}input{border:1px solid #9dabb6;min-width:0}input:focus{outline:3px solid #74cfc4;outline-offset:2px}button{border:0;background:#176d68;color:white;font-weight:600;cursor:pointer;margin-top:18px}button:focus-visible{outline:3px solid #74cfc4;outline-offset:3px}.note{font-size:13px;margin:20px 0 0}.error{color:#9a2929;background:#fff2f2;border-radius:8px;padding:12px}.error:empty{display:none}@media(max-width:420px){.card{padding:26px}}</style></head>
  <body><main class="card"><div class="brand">Shared Mail</div><h1>Your shared inbox</h1><p>Enter the shared password to view messages.</p><p class="error" role="alert">${message}</p><form method="post" action="/login"><label for="password">Dashboard password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" autofocus><button type="submit">Open inbox</button></form><p class="note">Ask Nawvid for the password. You stay signed in for seven days. Sign out when using a shared device.</p></main><script src="/login.js" defer></script></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function loginScript(): Response {
  return new Response(`const form = document.querySelector('form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  const error = document.querySelector('.error');
  button.disabled = true; button.textContent = 'Opening…'; error.textContent = '';
  try {
    const body = new URLSearchParams(new FormData(form));
    const response = await fetch('/login', { method: 'POST', body, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    form.reset();
    if (response.ok && response.redirected && new URL(response.url).pathname === '/') { location.replace('/'); return; }
    error.textContent = response.status === 429 ? 'Too many attempts. Please try again in ten minutes.' : response.status === 401 ? 'That password did not match. Please try again.' : 'Sign-in is temporarily unavailable. Please contact Nawvid.';
  } catch { error.textContent = 'Could not connect. Please try again.'; }
  button.disabled = false; button.textContent = 'Open inbox';
});`, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
}

export async function authenticate(request: Request, env: AuthEnv): Promise<Response> {
  // State changes require an exact origin match, in addition to SameSite cookies.
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
  if (!env.DASHBOARD_PASSWORD || !env.DASHBOARD_SESSION_KEY) return loginPage('Sign-in is temporarily unavailable. Please contact Nawvid.', 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const window = Math.floor(Date.now() / 600000);
  const bucket = await privateDigest(`login:${ip}:${window}`, env);
  // D1 updates are atomic across concurrent requests and Cloudflare locations.
  const attempt = await env.DB.prepare(`INSERT INTO login_attempts (bucket, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
    .bind(bucket, (window + 1) * 600000).first<{ attempts: number }>();
  if (!attempt || attempt.attempts > 10) {
    const response = loginPage('Too many attempts. Please try again in ten minutes.', 429);
    response.headers.set('Retry-After', '600');
    return response;
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return new Response('Unsupported form', { status: 415 });
  // Enforce the actual streamed length, including bodies without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 2048) { await reader.cancel(); return new Response('Form too large', { status: 413 }); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const password = new URLSearchParams(new TextDecoder().decode(bytes)).get('password') || '';
  const expected = await digest(env.DASHBOARD_PASSWORD);
  const supplied = await digest(password);
  // Compare fixed-size digests in constant time. Neither password nor its
  // unkeyed digest is stored in D1. A separate secret protects version markers.
  if (!timingSafeEqual(encoder.encode(expected), encoder.encode(supplied))) return loginPage('That password did not match. Please try again.', 401);
  const random = crypto.getRandomValues(new Uint8Array(32));
  const value = Array.from(random, b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO auth_sessions (token_hash, password_version, expires_at) VALUES (?, ?, ?)')
    .bind(await digest(value), await privateDigest(`version:${env.DASHBOARD_PASSWORD}`, env), Date.now() + SESSION_MS).run();
  return redirect('/', `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`);
}

export async function logout(request: Request, env: AuthEnv): Promise<Response> {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
  const value = token(request);
  if (value) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(value)).run();
  return redirect('/login', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
