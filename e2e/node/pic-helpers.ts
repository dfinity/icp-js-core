/**
 * Shared helpers for starting PocketIC, deploying canisters, and creating an HTTP gateway.
 */
import { PocketIcServer, PocketIc } from '@dfinity/pic';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANISTERS_DIR = resolve(__dirname, 'canisters');

interface StartPocketICOptions {
  gatewayPort?: number;
}

interface StartPocketICResult {
  picServer: PocketIcServer;
  pic: PocketIc;
  envVars: Record<string, string>;
}

/**
 * Start a PocketIC server, deploy canisters, and create an HTTP gateway.
 * @param root0 Options for starting PocketIC, including the gateway port (0 for auto-assign)
 * @param root0.gatewayPort The port for the HTTP gateway to listen on.
 */
export async function startPocketIC({
  gatewayPort = 0,
}: StartPocketICOptions = {}): Promise<StartPocketICResult> {
  const picServer = await PocketIcServer.start();
  const serverUrl = picServer.getUrl();

  const pic = await PocketIc.create(serverUrl);

  const deployCanister = async (wasmFile: string): Promise<string> => {
    const canisterId = await pic.createCanister();
    await pic.installCode({
      canisterId,
      wasm: resolve(CANISTERS_DIR, wasmFile),
    });
    return canisterId.toString();
  };

  const [
    counterCanisterId,
    counter2CanisterId,
    counter3CanisterId,
    whoamiCanisterId,
    trapCanisterId,
  ] = await Promise.all([
    deployCanister('counter.wasm'),
    deployCanister('counter.wasm'),
    deployCanister('counter.wasm'),
    deployCanister('whoami.wasm'),
    deployCanister('trap.wasm'),
  ]);

  const apRes = await fetch(`${serverUrl}/instances/0/auto_progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!apRes.ok) {
    throw new Error(`Failed to enable auto_progress: ${apRes.status} ${await apRes.text()}`);
  }

  const gwRes = await fetch(`${serverUrl}/http_gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forward_to: { PocketIcInstance: 0 },
      port: gatewayPort,
    }),
  });
  const gwData = (await gwRes.json()) as { Created: { port: number } };
  const port = gwData.Created.port;

  const envVars: Record<string, string> = {
    REPLICA_PORT: String(port),
    CANISTER_ID_COUNTER: counterCanisterId,
    CANISTER_ID_COUNTER2: counter2CanisterId,
    CANISTER_ID_COUNTER3: counter3CanisterId,
    CANISTER_ID_WHOAMI: whoamiCanisterId,
    CANISTER_ID_TRAP: trapCanisterId,
  };

  return { picServer, pic, envVars };
}
