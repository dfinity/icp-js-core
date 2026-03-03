import type { PocketIcServer, PocketIc } from '@dfinity/pic';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { startPocketIC } from './pic-helpers.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '.env');

let picServer: PocketIcServer;
let pic: PocketIc;

/** Start PocketIC and deploy canisters, or reuse an existing instance. */
export async function setup(): Promise<void> {
  // If a .env file already exists with REPLICA_PORT set (e.g., from setup-pic.ts),
  // verify the server is actually reachable before reusing it.
  if (existsSync(ENV_PATH)) {
    const existing = dotenv.parse(readFileSync(ENV_PATH));
    if (existing.REPLICA_PORT && existing.CANISTER_ID_COUNTER) {
      try {
        const res = await fetch(`http://127.0.0.1:${existing.REPLICA_PORT}/api/v2/status`);
        if (res.ok) {
          Object.assign(process.env, existing);
          return;
        }
      } catch {
        // Server not reachable — fall through to start a new one
      }
    }
  }

  const result = await startPocketIC();
  picServer = result.picServer;
  pic = result.pic;

  const envContent = Object.entries(result.envVars as Record<string, string>)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(ENV_PATH, `${envContent}\n`);

  // Also set process.env directly for the main process
  Object.assign(process.env, result.envVars);
}

/** Stop PocketIC and clean up the .env file. */
export async function teardown(): Promise<void> {
  await pic?.tearDown();
  await picServer?.stop();

  // Clean up the .env file we created so stale ports don't confuse future runs
  if (picServer && existsSync(ENV_PATH)) {
    unlinkSync(ENV_PATH);
  }
}
