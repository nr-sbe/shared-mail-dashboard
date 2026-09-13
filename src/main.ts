import './style.css';
import type { Feed, Message } from './types';

const demo = import.meta.env.VITE_DEMO === 'true';
const icons = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/></svg>',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <aside class="sidebar">
    <div class="brand"><span class="brand-icon">${icons.mail}</span><span>Shared<span class="brand-light">Mail</span></span></div>
    <div class="workspace-label">TEAM INBOX</div>
    <button class="all-mail active" id="all-mail">${icons.mail}<span>All messages</span><span id="total" class="nav-count">0</span></button>
    <div class="source-heading">SOURCES</div><div id="sources" class="sources"></div>
    <div class="sidebar-bottom"><div class="history-icon">72<span>h</span></div><div><strong>A little less inbox.</strong><p>Only the last three days.<br>Always in one place.</p></div></div>
  </aside>
  <main id="main">
    <header class="page-header"><div><div class="eyebrow">ONE SHARED VIEW</div><h1>Inbox</h1><p class="subtitle">The emails that matter, together.</p></div><div class="header-meta"><span class="public-badge">Private view</span><form id="logout" action="/logout" method="post"><button class="sign-out" type="submit">Sign out</button></form></div></header>
    <div id="demo-notice" class="notice demo-notice" hidden>Sample preview — these are fictional emails. Live mail is not connected.</div>
    <div class="toolbar"><label class="search">${icons.search}<span class="sr-only">Search emails</span><input id="search" type="search" placeholder="Search messages…" autocomplete="off" /></label><label class="mobile-source"><span class="sr-only">Filter by source</span><select id="source-select"><option value="">All sources</option></select></label><button id="refresh" class="refresh" aria-label="Refresh">${icons.refresh}<span>Refresh</span></button></div>
    <div class="feed-meta"><span id="results-count">Loading messages…</span><span id="sync-status" role="status" aria-live="polite">Connecting</span></div>
    <div id="error" class="notice error-notice" role="alert" hidden></div>
    <div class="mail-workspace"><section class="message-list" aria-label="Messages"><div id="messages"></div></section><section class="reader" aria-label="Selected message"><button id="back" class="back">← Back to messages</button><div id="reading-pane"></div></section></div>
    <footer>Original emails stay in Gmail.<span>Password protected · Last 72 hours</span></footer>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let feed: Feed = { messages: [], sources: [], serverTime: new Date().toISOString() };
let selectedId = '';
let sourceId = '';
let query = '';
let busy = false;
let loaded = false;
let connectionFailed = false;
let lastSync: Date | null = null;
let clockOffset = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let demoData: Feed | undefined;
let sessionTimer: ReturnType<typeof setTimeout> | undefined;
let sessionExpiresAt = 0;
let locked = false;

function clearPrivateView() {
  locked = true;
  feed = { messages: [], sources: [], serverTime: new Date().toISOString() };
  selectedId = ''; sourceId = ''; query = ''; demoData = undefined;
  clearTimeout(expiryTimer); clearTimeout(sessionTimer);
  document.querySelector('#app')?.replaceChildren();
}

function lock() {
  clearPrivateView();
  window.location.replace('/login');
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function senderName(sender: string) { return sender.replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || sender; }
function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date(Date.now() + clockOffset);
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function badge(label: string, id: string) {
  const b = node('span', 'source-badge', label);
  const index = Math.max(0, feed.sources.findIndex(s => s.id === id));
  b.dataset.color = String(index % 4);
  return b;
}

function safeLinks(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const part of text.split(/(https?:\/\/[^\s<>]+)/gi)) {
    if (/^https?:\/\//i.test(part)) {
      const a = node('a', '', part); a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer'; fragment.append(a);
    } else fragment.append(document.createTextNode(part));
  }
  return fragment;
}

function renderReader() {
  const reader = el('reading-pane');
  const m = feed.messages.find(m => m.id === selectedId);
  if (!m) {
    reader.replaceChildren(node('div', 'reader-empty', loaded ? 'Select a message to read it here.' : connectionFailed ? 'Messages will appear once the inbox is connected.' : 'Your shared inbox is loading…'));
    delete reader.dataset.messageId;
    return;
  }
  const head = node('div', 'reader-head');
  head.append(badge(m.sourceLabel, m.sourceId), node('span', 'reader-date', new Date(m.receivedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
  const title = node('h2', '', m.subject || '(No subject)'); title.tabIndex = -1; title.id = 'message-title';
  const byline = node('div', 'byline');
  const avatar = node('div', 'avatar', senderName(m.sender).slice(0, 1).toUpperCase());
  const sender = node('div', 'sender-details'); sender.append(node('strong', '', senderName(m.sender)), node('span', '', m.sender));
  byline.append(avatar, sender);
  const body = node('div', 'message-body'); body.append(safeLinks(m.body || '(This email has no text content.)'));
  const note = node('div', 'reader-note', 'Message text only · Attachments are not displayed');
  reader.replaceChildren(head, title, byline, body, note);
  reader.dataset.messageId = m.id;
}

function renderSources() {
  const container = el('sources'); container.replaceChildren();
  el('all-mail').classList.toggle('active', !sourceId);
  el('all-mail').setAttribute('aria-pressed', String(!sourceId));
  const select = el<HTMLSelectElement>('source-select');
  select.replaceChildren(new Option('All sources', ''));
  for (const [index, source] of feed.sources.entries()) {
    const button = node('button', `source-button${sourceId === source.id ? ' active' : ''}`);
    button.setAttribute('aria-pressed', String(sourceId === source.id));
    button.dataset.source = source.id;
    const marker = node('span', 'source-marker'); marker.dataset.color = String(index % 4);
    button.append(marker, node('span', 'source-label', source.label), node('span', 'source-count', String(feed.messages.filter(m => m.sourceId === source.id).length)));
    button.addEventListener('click', () => { sourceId = source.id; render(); });
    container.append(button); select.append(new Option(source.label, source.id));
  }
  if (!feed.sources.length) container.append(node('p', 'source-placeholder', 'Sources will appear here.'));
  select.value = sourceId;
}

function render() {
  const now = Date.now() + clockOffset;
  feed.messages = feed.messages.filter(m => Date.parse(m.expiresAt) > now);
  if (!feed.messages.some(m => m.id === selectedId)) {
    selectedId = feed.messages[0]?.id || '';
    document.body.classList.remove('reader-open');
  }
  const focusId = (document.activeElement as HTMLElement | null)?.dataset.message;
  const focusSource = (document.activeElement as HTMLElement | null)?.dataset.source;
  renderSources();
  el('total').textContent = String(feed.messages.length);
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = feed.messages.filter(m => (!sourceId || m.sourceId === sourceId)
    && terms.every(t => `${m.subject}\n${m.sender}\n${m.body}`.toLocaleLowerCase().includes(t)));
  el('results-count').textContent = `${visible.length} message${visible.length === 1 ? '' : 's'}${query || sourceId ? ' found' : ' in the last 3 days'}`;
  const list = el('messages'); list.replaceChildren();
  for (const m of visible) {
    const button = node('button', `message-card${m.id === selectedId ? ' selected' : ''}`);
    button.dataset.message = m.id; button.setAttribute('aria-pressed', String(m.id === selectedId));
    const top = node('div', 'message-top'); top.append(node('span', 'message-sender', senderName(m.sender)), node('time', 'message-time', dateLabel(m.receivedAt)));
    const subject = node('strong', 'message-subject', m.subject || '(No subject)');
    const preview = node('p', 'message-preview', m.body.replace(/\s+/g, ' '));
    button.append(top, subject, preview, badge(m.sourceLabel, m.sourceId));
    button.addEventListener('click', () => {
      selectedId = m.id; document.body.classList.add('reader-open'); render();
      el('message-title').focus({ preventScroll: true }); el('reading-pane').scrollTop = 0;
    });
    list.append(button);
  }
  if (!visible.length) {
    const empty = node('div', 'list-empty');
    empty.append(node('div', 'empty-symbol', '✉'), node('h2', '', query || sourceId ? 'No matching messages' : loaded ? 'You’re all caught up' : connectionFailed ? 'Inbox not connected' : 'Connecting your inbox'),
      node('p', '', query || sourceId ? 'Try another search or choose all sources.' : connectionFailed && !loaded ? 'Refresh after the connection is restored.' : 'New matching emails will appear here automatically.'));
    list.append(empty);
  }
  // Preserve body selection and scroll when a background refresh changes other mail.
  if (el('reading-pane').dataset.messageId !== selectedId) renderReader();
  if (focusId) Array.from(list.querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.message === focusId)?.focus({ preventScroll: true });
  if (focusSource) Array.from(el('sources').querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.source === focusSource)?.focus({ preventScroll: true });
  clearTimeout(expiryTimer);
  const next = Math.min(...feed.messages.map(m => Date.parse(m.expiresAt)));
  if (Number.isFinite(next)) expiryTimer = setTimeout(render, Math.min(2147483647, Math.max(1, next - now + 10)));
}

function validFeed(data: unknown): data is Feed {
  if (!data || typeof data !== 'object') return false;
  const f = data as Feed;
  return Array.isArray(f.messages) && Array.isArray(f.sources) && Number.isFinite(Date.parse(f.serverTime))
    && f.sources.every(s => typeof s.id === 'string' && typeof s.label === 'string')
    && f.messages.every(m => ['id', 'sourceId', 'sourceLabel', 'sender', 'subject', 'body'].every(k => typeof m[k as keyof Message] === 'string')
      && Number.isFinite(Date.parse(m.receivedAt)) && Number.isFinite(Date.parse(m.expiresAt)));
}

async function refresh() {
  if (busy || locked) return;
  busy = true; el<HTMLButtonElement>('refresh').disabled = true;
  el('sync-status').textContent = 'Refreshing…';
  try {
    let data: Feed;
    if (demo) {
      demoData ??= (await import('./demo')).demoFeed();
      data = { ...demoData, serverTime: new Date().toISOString() };
    } else {
      const response = await fetch('/api/messages', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(12000) });
      if (response.status === 401) { lock(); return; }
      if (!response.ok) throw new Error('Could not refresh mail. Please try again shortly.');
      data = await response.json();
    }
    if (!validFeed(data)) throw new Error('The inbox returned an unexpected response. Please try again.');
    if (locked) return;
    clockOffset = Date.parse(data.serverTime) - Date.now();
    if (!demo) {
      if (!Number.isFinite(data.sessionExpiresAt)) { lock(); return; }
      sessionExpiresAt = data.sessionExpiresAt!;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(lock, Math.max(0, sessionExpiresAt - (Date.now() + clockOffset)));
    }
    feed = data; loaded = true; connectionFailed = false; lastSync = new Date();
    if (sourceId && !feed.sources.some(s => s.id === sourceId)) sourceId = '';
    el('error').hidden = true;
    el('sync-status').textContent = `Updated ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Auto-refresh on`;
  } catch (error) {
    if (locked) return;
    connectionFailed = true;
    el('error').textContent = error instanceof Error ? error.message : 'Could not refresh mail.';
    el('error').hidden = false;
    el('sync-status').textContent = lastSync ? `Refresh failed · Last updated ${lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not connected';
  } finally {
    busy = false;
    if (!locked) { el<HTMLButtonElement>('refresh').disabled = false; render(); }
  }
}

el('demo-notice').hidden = !demo;
el('logout').hidden = demo;
el('logout').addEventListener('submit', async event => {
  event.preventDefault();
  clearPrivateView();
  try {
    const response = await fetch('/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Sign-out failed');
    window.location.replace('/login');
  } catch {
    const retry = node('button', 'sign-out', 'Connection lost. Reconnect, reopen the dashboard, and sign out again.');
    retry.addEventListener('click', () => window.location.reload());
    document.querySelector('#app')?.append(retry);
  }
});
el<HTMLInputElement>('search').addEventListener('input', event => { query = (event.target as HTMLInputElement).value; render(); });
el<HTMLSelectElement>('source-select').addEventListener('change', event => { sourceId = (event.target as HTMLSelectElement).value; render(); });
el('all-mail').addEventListener('click', () => { sourceId = ''; render(); });
el('refresh').addEventListener('click', refresh);
el('back').addEventListener('click', () => { document.body.classList.remove('reader-open'); Array.from(el('messages').querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.message === selectedId)?.focus(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !locked) {
    if (!demo && sessionExpiresAt && Date.now() + clockOffset >= sessionExpiresAt) { lock(); return; }
    render(); void refresh();
  }
});
window.addEventListener('pageshow', event => { if (event.persisted && !demo) { clearPrivateView(); window.location.reload(); } });
window.addEventListener('online', refresh);
setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
void refresh();
