import type { HttpAgentOptions } from '@icp-sdk/core/agent';
import { HttpAgent } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';

export const identity = Ed25519KeyIdentity.generate();
export const principal = identity.getPrincipal();

export const port = parseInt(process.env['REPLICA_PORT'] || '4943', 10);
if (Number.isNaN(port)) {
  throw new Error('The environment variable REPLICA_PORT is not a number.');
}

export const makeAgent = async (options?: HttpAgentOptions) => {
  return await HttpAgent.create({
    host: `http://127.0.0.1:${process.env.REPLICA_PORT ?? 4943}`,
    shouldFetchRootKey: true,
    ...options,
  });
};

const agent = makeAgent();

export default agent;
