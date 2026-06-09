import { describe, it, expect } from 'vitest';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { getDefaultEffectiveCanisterId } from './basic.test.ts';
import { makeAgent } from '../utils/agent.ts';

const MANAGEMENT_CANISTER = Principal.fromText('aaaaa-aa');

// Minimal IDL for provisional_create_canister_with_cycles
const provisionalCreateArgsIdl = IDL.Record({
  amount: IDL.Opt(IDL.Nat),
  // Settings are complex; we pass None so a stub record suffices here.
  settings: IDL.Opt(IDL.Record({})),
  specified_id: IDL.Opt(IDL.Principal),
  sender_canister_version: IDL.Opt(IDL.Nat64),
});

const provisionalCreateResponseIdl = IDL.Record({
  canister_id: IDL.Principal,
});

describe('effective subnet ID', () => {
  it('should discover the default subnet ID and create a canister targeting it', async () => {
    const agent = await makeAgent();

    // Discover the subnet ID for the default PocketIC subnet.
    const defaultCanisterId = await getDefaultEffectiveCanisterId();
    const subnetId = await agent.getSubnetIdFromCanister(defaultCanisterId);
    expect(subnetId).toBeInstanceOf(Principal);

    // Create a canister via the management canister, routing to the subnet by subnet ID.
    const arg = new Uint8Array(
      IDL.encode(
        [provisionalCreateArgsIdl],
        [
          {
            amount: [100_000_000_000n],
            settings: [],
            specified_id: [],
            sender_canister_version: [],
          },
        ],
      ),
    );

    const { reply } = await agent.update(MANAGEMENT_CANISTER, {
      methodName: 'provisional_create_canister_with_cycles',
      arg,
      effectiveTarget: { subnetId },
    });

    const [{ canister_id }] = IDL.decode([provisionalCreateResponseIdl], reply) as unknown as [
      { canister_id: Principal },
    ];
    expect(canister_id).toBeInstanceOf(Principal);
  }, 30_000);
});
