import { Certificate, LookupPathResultFound, LookupPathStatus } from '@icp-sdk/core/agent';
import { IDL, PipeArrayBuffer } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import agent from '../utils/agent.ts';
import { test, expect } from 'vitest';
import { utf8ToBytes } from '@noble/hashes/utils';

/**
 * Util for determining the default effective canister id, necessary for pocketic
 * @returns the default effective canister id
 */
export async function getDefaultEffectiveCanisterId() {
  const res = await fetch('http://localhost:4943/_/topology');
  const data = await res.json();
  const id = data['default_effective_canister_id']['canister_id'];
  // decode from base64
  const decoded = Buffer.from(id, 'base64').toString('hex');

  return Principal.fromHex(decoded);
}

test('read_state', async () => {
  const ecid = await getDefaultEffectiveCanisterId();
  const resolvedAgent = await agent;
  const now = Date.now() / 1000;
  const validTimePath = [utf8ToBytes('time')];
  const invalidTimePath = [utf8ToBytes('Time')];

  const response = await resolvedAgent.readState(ecid, {
    paths: [validTimePath],
  });
  if (resolvedAgent.rootKey == null) throw new Error(`The agent doesn't have a root key yet`);
  const cert = await Certificate.create({
    certificate: response.certificate,
    rootKey: resolvedAgent.rootKey,
    subject: { canisterId: ecid },
  });

  const timeLookup = cert.lookup_path(validTimePath);
  expect(timeLookup).toEqual({
    status: LookupPathStatus.Found,
    value: expect.any(Uint8Array),
  });

  expect(cert.lookup_path(invalidTimePath)).toEqual({
    status: LookupPathStatus.Unknown,
  });

  const decoded = new IDL.NatClass().decodeValue(
    new PipeArrayBuffer((timeLookup as LookupPathResultFound).value),
    IDL.Nat,
  );

  const time = Number(decoded) / 1e9;
  // The diff between decoded time and local time is within 5s
  expect(Math.abs(time - now)).toBeLessThan(5);
});

test('read_state with passed request', async () => {
  const resolvedAgent = await agent;
  const now = Date.now() / 1000;
  const path = [utf8ToBytes('time')];
  const canisterId = await getDefaultEffectiveCanisterId();
  const request = await resolvedAgent.createReadStateRequest({ paths: [path] });
  const response = await resolvedAgent.readState(canisterId, { paths: [path] }, undefined, request);
  if (resolvedAgent.rootKey == null) throw new Error(`The agent doesn't have a root key yet`);
  const cert = await Certificate.create({
    certificate: response.certificate,
    rootKey: resolvedAgent.rootKey,
    subject: { canisterId: canisterId },
  });
  expect(cert.lookup_path([utf8ToBytes('Time')])).toEqual({
    status: LookupPathStatus.Unknown,
  });

  let rawTime = cert.lookup_path(path);

  expect(rawTime.status).toEqual(LookupPathStatus.Found);
  rawTime = rawTime as LookupPathResultFound;

  expect(rawTime.value).toBeInstanceOf(Uint8Array);

  const decoded = new IDL.NatClass().decodeValue(new PipeArrayBuffer(rawTime.value), IDL.Nat);
  const time = Number(decoded) / 1e9;
  // The diff between decoded time and local time is within 5s
  expect(Math.abs(time - now)).toBeLessThan(5);
});
