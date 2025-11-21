import { Principal } from '#principal';
import * as CanisterStatus from './canisterStatus/index.ts';
import { IDL } from '#candid';
import { HttpAgent } from './agent/http/index.ts';
import { Actor, type ActorSubclass } from './actor.ts';

/**
 * Retrieves the Candid interface for the specified canister.
 * @param canisterId A string corresponding to the canister ID
 * @param agent The agent to use for the request (usually an `HttpAgent`)
 * @returns Candid source code
 */
export async function fetchCandid(canisterId: string, agent?: HttpAgent): Promise<string> {
  if (!agent) {
    // Create an anonymous `HttpAgent` (adapted from Candid UI)
    agent = await HttpAgent.create();
  }

  // Attempt to use canister metadata
  const status = await CanisterStatus.request({
    agent,
    canisterId: Principal.fromText(canisterId),
    paths: ['candid'],
  });
  const candid = status.get('candid') as string | undefined;
  if (candid) {
    return candid;
  }

  // Use `__get_candid_interface_tmp_hack` for canisters without Candid metadata
  const tmpHackInterface: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ['query']),
    });
  const actor: ActorSubclass = Actor.createActor(tmpHackInterface, { agent, canisterId });
  return (await actor.__get_candid_interface_tmp_hack()) as string;
}
