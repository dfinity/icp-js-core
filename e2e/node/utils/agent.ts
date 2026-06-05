import type { HttpAgentOptions } from '@icp-sdk/core/agent';
import { HttpAgent } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';

export const identity = Ed25519KeyIdentity.generate();
export const principal = identity.getPrincipal();

export const gatewayPort = parseInt(process.env['GATEWAY_PORT'] || '4943', 10);
if (Number.isNaN(gatewayPort)) {
  throw new Error('The environment variable GATEWAY_PORT is not a number.');
}

export const makeAgent = async (options?: HttpAgentOptions) => {
  return await HttpAgent.create({
    host: process.env.SERVER_URL
      ? new URL('/instances/0/', process.env.SERVER_URL).toString()
      : `http://127.0.0.1:${gatewayPort}`,
    shouldFetchRootKey: true,
    ...options,
  });
};

const agent = makeAgent();

export default agent;
