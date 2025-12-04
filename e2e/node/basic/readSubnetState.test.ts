import { HttpAgent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { describe, it, expect, vi } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils';

const MINUTES_TO_MSEC = 60_000;

vi.setConfig({ testTimeout: 30_000 });

// Existing mainnet canisters for testing
const WHOAMI_CANISTER = 'ivcos-eqaaa-aaaab-qablq-cai';
const NNS_GOVERNANCE_CANISTER = 'rrkah-fqaaa-aaaaa-aaaaq-cai';

const createMainnetAgent = async () => {
  return HttpAgent.createSync({ host: 'https://icp-api.io' });
};

describe('getSubnetIdFromCanister', () => {
  it('should get the subnet ID for a canister', async () => {
    const agent = await createMainnetAgent();
    const expectedSubnetId = 'pae4o-o6dxf-xki7q-ezclx-znyd6-fnk6w-vkv5z-5lfwh-xym2i-otrrw-fqe';

    const subnetId1 = await agent.getSubnetIdFromCanister(WHOAMI_CANISTER);
    expect(subnetId1.toText()).toEqual(expectedSubnetId);

    // This also ensures that two calls with the same canister ID return the same subnet ID
    const subnetId2 = await agent.getSubnetIdFromCanister(Principal.fromText(WHOAMI_CANISTER));
    expect(subnetId2.toText()).toEqual(expectedSubnetId);
  });

  it('should get the subnet ID for a canister in the root subnet', async () => {
    const agent = await createMainnetAgent();
    const subnetId = await agent.getSubnetIdFromCanister(NNS_GOVERNANCE_CANISTER);
    expect(subnetId.toText()).toEqual(
      'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe',
    );
  });

  it('should fail if the canister is not found', async () => {
    const agent = await createMainnetAgent();
    await expect(agent.getSubnetIdFromCanister('aaaaa-aa')).rejects.toThrow();
  });
});

describe('readSubnetState', () => {
  it('should read time from subnet state', async () => {
    const agent = await createMainnetAgent();

    // First get a subnet ID from a known canister
    const subnetId = await agent.getSubnetIdFromCanister(WHOAMI_CANISTER);

    // Then read the subnet state
    const response = await agent.readSubnetState(subnetId, {
      paths: [[utf8ToBytes('time')]],
    });

    expect(response.certificate).toBeDefined();

    // Just try to parse the certificate to ensure it's valid
    const subnetTime = agent.parseTimeFromResponse(response);
    expect(subnetTime).toBeGreaterThan(0);
    // Sanity check: just check that the subnet time is not
    // in the past or future by more than 5 minutes
    const now = Date.now();
    expect(Math.abs(subnetTime - now)).toBeLessThanOrEqual(5 * MINUTES_TO_MSEC);
  });
});
