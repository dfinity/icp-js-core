import { Actor } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import agent from '../utils/agent.ts';
import { requireEnv } from '../test-setup.ts';

let cache: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actor: any;
  canisterId: Principal;
  idl: IDL.InterfaceFactory;
} | null = null;

/**
 * Create an Actor that acts as an 'whoami service' (echoes back request.caller Principal)
 */
export default async function (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actor: any;
  canisterId: Principal;
  idl: IDL.InterfaceFactory;
}> {
  if (!cache) {
    const canisterId = Principal.fromText(requireEnv('CANISTER_ID_WHOAMI'));

    const idl: IDL.InterfaceFactory = ({ IDL }) => {
      return IDL.Service({
        whoami: IDL.Func([], [IDL.Principal], []),
        whoami_query: IDL.Func([], [IDL.Principal], ['query']),
      });
    };

    cache = {
      canisterId,
      idl,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actor: Actor.createActor(idl, { canisterId, agent: await agent }) as any,
    };
  }

  return cache;
}
