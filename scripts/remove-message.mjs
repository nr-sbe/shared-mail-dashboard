import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [id, mode] = process.argv.slice(2);
if (!/^[a-zA-Z0-9-]+:[a-z0-9-]+$/.test(id || '') || !['--local', '--remote'].includes(mode)) {
  console.error('Usage: node scripts/remove-message.mjs PROVIDER-ID:SOURCE-ID --remote');
  process.exit(1);
}
const providerId = id.split(':')[0];
const expiresAt = Date.now() + 72 * 3600000;
// All copies of this provider message are removed. A replay cannot bring it back.
const sql = `INSERT OR REPLACE INTO removed_messages(provider_id, expires_at) VALUES ('${providerId}', ${expiresAt}); DELETE FROM messages WHERE provider_id = '${providerId}';`;
const result = spawnSync(process.execPath, [require.resolve('wrangler/bin/wrangler.js'), 'd1', 'execute', 'shared-mail', mode, '--command', sql], { stdio: 'inherit' });
process.exit(result.status ?? 1);
