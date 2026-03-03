/**
 * Standalone script to start PocketIC, deploy canisters, and create an HTTP gateway.
 * Used by CI workflows that need PocketIC running before other processes (e.g., mitmdump).
 *
 * Usage:
 *   npx tsx setup-pic.ts [--gateway-port PORT]    Start PocketIC and keep alive
 *   npx tsx setup-pic.ts --wait [--timeout SEC]    Wait for a running instance to be ready
 *
 * Writes a .env file with REPLICA_PORT and canister IDs.
 * The PocketIC server stays running until this process is killed.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startPocketIC } from './pic-helpers.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '.env');

const args = process.argv.slice(2);

if (args.includes('--wait')) {
  const timeoutIdx = args.indexOf('--timeout');
  const timeoutSec = timeoutIdx !== -1 ? Number(args[timeoutIdx + 1]) : 30;

  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, 'utf-8');
      if (content.includes('REPLICA_PORT')) {
        // eslint-disable-next-line no-console
        console.log(content.trim());
        process.exit(0);
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // eslint-disable-next-line no-console
  console.error(`Timed out after ${timeoutSec}s waiting for PocketIC .env`);
  process.exit(1);
}

const portIdx = args.indexOf('--gateway-port');
const gatewayPort = portIdx !== -1 ? Number(args[portIdx + 1]) : 0;

const { envVars } = await startPocketIC({ gatewayPort });

const envContent = Object.entries(envVars)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
writeFileSync(ENV_PATH, `${envContent}\n`);

// eslint-disable-next-line no-console
console.log(`PocketIC gateway listening on port ${envVars.REPLICA_PORT}`);
// eslint-disable-next-line no-console
console.log(`Canister IDs written to .env`);

// Keep the process alive until killed
await new Promise(() => {});
