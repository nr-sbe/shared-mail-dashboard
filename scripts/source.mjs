import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// This local file is ignored by Git. Upload with `wrangler secret put SOURCES_JSON`.
const file = new URL('../sources.local.json', import.meta.url);
const [action, id, label, domain] = process.argv.slice(2);
const sources = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
if (action === 'add' && /^[a-z0-9-]{1,40}$/.test(id || '') && label && /^[a-z0-9.-]+\.resend\.app$/.test(domain || '')) {
  if (sources.some(s => s.id === id)) throw new Error('That source already exists.');
  sources.push({ id, label, address: `${randomBytes(18).toString('hex')}@${domain}`, active: false, activeSince: null });
} else if (action === 'activate' || action === 'deactivate') {
  const source = sources.find(s => s.id === id);
  if (!source) throw new Error('Source not found.');
  source.active = action === 'activate';
  source.activeSince = source.active ? new Date().toISOString() : null;
} else {
  console.log('Add: node scripts/source.mjs add operations "Operations" your-domain.resend.app');
  console.log('After Gmail verification: node scripts/source.mjs activate operations');
  console.log('Pause: node scripts/source.mjs deactivate operations');
  process.exit(1);
}
writeFileSync(file, JSON.stringify(sources, null, 2) + '\n', { mode: 0o600 });
console.log('Updated sources.local.json. Keep this file private. Upload it as the SOURCES_JSON Worker secret.');
