import {
  Actor,
  AnonymousIdentity,
  HttpAgent,
  Identity,
  CanisterStatus,
  polling,
  requestIdOf,
  ProtocolError,
  DerKeyLengthMismatchErrorCode,
} from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { describe, it, expect, vi, test } from 'vitest';
import { makeAgent } from '../utils/agent.ts';
import { hexToBytes } from '@noble/hashes/utils';

const { pollForResponse } = polling;

const createWhoamiActor = async (identity: Identity) => {
  const canisterId = 'ivcos-eqaaa-aaaab-qablq-cai';
  const idlFactory = () => {
    return IDL.Service({
      whoami: IDL.Func([], [IDL.Principal], ['query']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as unknown as any;
  };

  const agent = await makeAgent({ host: 'https://icp-api.io', identity });

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
  });
};

describe('certified query', () => {
  it('should verify a query certificate', async () => {
    const actor = await createWhoamiActor(new AnonymousIdentity());
    const result = await actor.whoami();
    expect(Principal.from(result)).toBeInstanceOf(Principal);
  }, 10_000);
  describe('should verify lots of query certificates', async () => {
    let count = 0;
    const identities = Array.from({ length: 20 }).map(() => {
      const newIdentity = Ed25519KeyIdentity.generate(new Uint8Array(32).fill(count));
      count++;
      return newIdentity;
    });
    test.each(identities.map((identity, idx) => [`whoami seed ${idx}`, identity]))(
      '%s',
      async (_, identity) => {
        const actor = await createWhoamiActor(identity);

        const result = (await actor.whoami()) as Principal;
        expect(Principal.from(result)).toBeInstanceOf(Principal);
        expect(result.toString()).toMatchSnapshot();
      },
    );
  });
});

describe('controllers', () => {
  it('should return the controllers of a canister with multiple controllers', async () => {
    const agent = new HttpAgent({ host: 'https://icp-api.io' });
    const status = await CanisterStatus.request({
      // Whoami canister
      canisterId: Principal.from('ivcos-eqaaa-aaaab-qablq-cai'),
      agent: agent,
      paths: ['controllers'],
    });
    expect((status.get('controllers') as Principal[]).map(p => p.toText())).toMatchInlineSnapshot(`
    [
      "hgfyw-myaaa-aaaab-qaaoa-cai",
      "b73qn-rqaaa-aaaap-aazvq-cai",
      "5vdms-kaaaa-aaaap-aa3uq-cai",
      "aux4w-bi6yf-a3bhr-zydhx-qvf2p-ymdeg-ddvg6-gmobi-ct4dk-wf4xd-nae",
      "jhnlf-yu2dz-v7beb-c77gl-76tj7-shaqo-5qfvi-htvel-gzamb-bvzx6-yqe",
    ]
  `);
  });
  it('should return the controllers of a canister with one controller', async () => {
    const agent = new HttpAgent({ host: 'https://icp-api.io' });
    const status = await CanisterStatus.request({
      // NNS Governance Canister
      canisterId: Principal.from('rrkah-fqaaa-aaaaa-aaaaq-cai'),
      agent: agent,
      paths: ['controllers'],
    });
    // Should be root canister
    expect((status.get('controllers') as Principal[]).map(p => p.toText())).toMatchInlineSnapshot(`
    [
      "r7inp-6aaaa-aaaaa-aaabq-cai",
    ]
  `);
  });
  it('should return the controllers of a canister with no controllers', async () => {
    const agent = new HttpAgent({ host: 'https://icp-api.io' });
    const status = await CanisterStatus.request({
      // nomeata's capture-the-ic-token canister
      canisterId: Principal.from('fj6bh-taaaa-aaaab-qaacq-cai'),
      agent: agent,
      paths: ['controllers'],
    });
    expect((status.get('controllers') as Principal[]).map(p => p.toText())).toMatchInlineSnapshot(`
    []
  `);
  });
});

describe('call forwarding', () => {
  it('should handle call forwarding', async () => {
    vi.useRealTimers();
    const counterCanisterId = 'tnnnb-2yaaa-aaaab-qaiiq-cai';
    const forwardedOptions = {
      canisterId: counterCanisterId,
      methodName: 'inc_read',
      arg: '4449444c0000',
      effectiveCanisterId: counterCanisterId,
    };

    const agent = new HttpAgent({ host: 'https://icp-api.io' });
    const { requestId, requestDetails } = await agent.call(
      Principal.fromText(forwardedOptions.canisterId),
      {
        methodName: forwardedOptions.methodName,
        arg: hexToBytes(forwardedOptions.arg),
        effectiveCanisterId: Principal.fromText(forwardedOptions.effectiveCanisterId),
      },
    );

    expect(requestIdOf(requestDetails!)).toStrictEqual(requestId);

    const { certificate, reply } = await pollForResponse(
      agent,
      Principal.fromText(forwardedOptions.effectiveCanisterId),
      requestId,
    );
    expect(certificate).toBeTruthy();
    expect(reply).toBeTruthy();
  }, 15_000);
});

// TODO: change Expiry logic rounding to make <= 1 minute expiry work
test('it should succeed when setting an expiry in the near future', async () => {
  const agent = await HttpAgent.create({
    host: 'https://icp-api.io',
    ingressExpiryInMinutes: 1,
  });

  await agent.syncTime();
  const counterCanisterId = 'tnnnb-2yaaa-aaaab-qaiiq-cai';

  await expect(
    agent.call(counterCanisterId, {
      methodName: 'inc_read',
      arg: hexToBytes('4449444c0000'),
      effectiveCanisterId: counterCanisterId,
    }),
  ).resolves.toBeDefined();
});

test('it should succeed when setting an expiry in the future', async () => {
  const agent = await HttpAgent.create({
    host: 'https://icp-api.io',
    ingressExpiryInMinutes: 5,
  });

  await agent.syncTime();
  const counterCanisterId = 'tnnnb-2yaaa-aaaab-qaiiq-cai';

  await expect(
    agent.call(counterCanisterId, {
      methodName: 'inc_read',
      arg: hexToBytes('4449444c0000'),
      effectiveCanisterId: counterCanisterId,
    }),
  ).resolves.toBeDefined();
});

test('it should fail when setting an expiry in the far future', async () => {
  await expect(
    HttpAgent.create({
      host: 'https://icp-api.io',
      ingressExpiryInMinutes: 100,
    }),
  ).rejects.toThrowError(`The maximum ingress expiry time is 5 minutes`);
});

test('it should allow you to set an incorrect root key', async () => {
  const agent = HttpAgent.createSync({
    rootKey: new Uint8Array(31),
  });
  const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      whoami: IDL.Func([], [IDL.Principal], ['query']),
    });

  const actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai'),
  });

  expect.assertions(3);
  try {
    await actor.whoami();
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolError);
    const errorCode = (error as ProtocolError).cause.code;
    expect(errorCode).toBeInstanceOf(DerKeyLengthMismatchErrorCode);
    expect(errorCode.requestContext).toBeDefined();
  }
});
