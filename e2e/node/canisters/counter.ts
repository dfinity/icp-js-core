import type { ActorSubclass, HttpAgentOptions, Agent, ActorConfig } from '@icp-sdk/core/agent';
import { Actor } from '@icp-sdk/core/agent';
import { makeAgent } from '../utils/agent.ts';
import type { _SERVICE } from './declarations/counter/counter.did.ts';
import type { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { requireEnv } from '../test-setup.ts';

export const idl: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    inc: IDL.Func([], [], []),
    inc_read: IDL.Func([], [IDL.Nat], []),
    read: IDL.Func([], [IDL.Nat], ['query']),
    write: IDL.Func([IDL.Nat], [], []),
    greet: IDL.Func([IDL.Text], [IDL.Text], []),
    queryGreet: IDL.Func([IDL.Text], [IDL.Text], ['query']),
  });
};

export const counterCanisterId = Principal.fromText(requireEnv('CANISTER_ID_COUNTER'));

export const counter2CanisterId = Principal.fromText(requireEnv('CANISTER_ID_COUNTER2'));

export const createActor = async (
  canisterId: Principal,
  options?: {
    agentOptions?: HttpAgentOptions;
    actorOptions?: ActorConfig;
    agent?: Agent;
  },
) => {
  const effectiveAgent = options?.agent ? options.agent : await makeAgent(options?.agentOptions);

  return Actor.createActor(idl, { canisterId, agent: effectiveAgent }) as ActorSubclass<_SERVICE>;
};

// Export the counter actor directly
export const counterActor = await createActor(counterCanisterId);

// Export the counter2 actor directly
export const counter2Actor = await createActor(counter2CanisterId);
