import { Actor, type ActorConfig, type ActorSubclass } from '@icp-sdk/core/agent';
import { idlFactory } from './assets_idl.ts';
import type _SERVICE from './assets_service.ts';

export type AssetsCanisterRecord = _SERVICE;

/**
 * Create an assets canister actor
 * @param config Configuration to make calls to the Replica.
 */
export function getAssetsCanister(config: ActorConfig): ActorSubclass<AssetsCanisterRecord> {
  return Actor.createActor<AssetsCanisterRecord>(idlFactory, config);
}
