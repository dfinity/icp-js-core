import { Principal } from '#principal';
import type { InputTargetPrincipal } from '../agent/api.ts';
import type { TargetPrincipal } from '../certificate.ts';
import type { ExpirableStore } from './expirableStore.ts';

/**
 * Converts InputTargetPrincpal to TargetPrincipal via Principal.from
 * @param target
 * @returns TargetPrincipal
 */
export function inputToTarget(target: InputTargetPrincipal): TargetPrincipal {
  if ('canisterId' in target) {
    return { canisterId: Principal.from(target.canisterId) };
  }
  return { subnetId: Principal.from(target.subnetId) };
}

/**
 * Stringifies a TargetPrincipal into a unique string key.
 * @param target
 * @returns Key suitable for use in e.g. {@link ExpirableStore}
 */
export function getTargetKey(target: TargetPrincipal): string {
  return 'canisterId' in target
    ? `canister:${target.canisterId.toText()}`
    : `subnet:${target.subnetId.toText()}`;
}
