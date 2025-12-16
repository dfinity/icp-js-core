import { vi, expect, it, beforeEach, describe } from 'vitest';
import { CertificateNotAuthorizedErrorCode, HttpAgent, TrustError } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import {
  MockReplica,
  prepareV3ReadStateResponse,
  prepareV3ReadStateRootSubnetResponse,
} from '../utils/mock-replica.ts';
import { randomIdentity, randomKeyPair } from '../utils/identity.ts';

describe('fetchSubnetKeys (root key, no delegation)', () => {
  const now = new Date('2025-12-16T06:34:56.789Z');
  const canisterId = Principal.fromText('v2nog-2aaaa-aaaab-p777q-cai');

  const rootSubnetKeyPair = randomKeyPair();
  const nodeIdentity = randomIdentity();
  const identity = randomIdentity();

  let mockReplica: MockReplica;

  beforeEach(async () => {
    mockReplica = await MockReplica.create();

    vi.setSystemTime(now);
  });

  it('should verify that the canister is in the allowed canister ranges', async () => {
    const agent = await HttpAgent.create({
      host: mockReplica.address,
      rootKey: rootSubnetKeyPair.publicKeyDer,
      identity,
    });

    const { responseBody: readStateResponseBody } = await prepareV3ReadStateRootSubnetResponse({
      nodeIdentity,
      canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
      rootSubnetKeyPair,
      date: now,
    });
    mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
      res.status(200).send(readStateResponseBody);
    });

    const nodeKeys = await agent.fetchSubnetKeys(canisterId);

    const expectedNodeKey = nodeIdentity.getPublicKey().toDer();
    expect(nodeKeys.get(nodeIdentity.getPrincipal().toText())).toEqual(expectedNodeKey);
    expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
  });

  it('should throw if the canister is not in the allowed canister ranges', async () => {
    const agent = await HttpAgent.create({
      host: mockReplica.address,
      rootKey: rootSubnetKeyPair.publicKeyDer,
      identity,
    });
    const anotherCanisterId = Principal.fromText('jrlun-jiaaa-aaaab-aaaaa-cai');

    const { responseBody: readStateResponseBody } = await prepareV3ReadStateRootSubnetResponse({
      nodeIdentity,
      canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
      rootSubnetKeyPair,
      date: now,
    });
    mockReplica.setV3ReadStateSpyImplOnce(anotherCanisterId.toString(), (_req, res) => {
      res.status(200).send(readStateResponseBody);
    });

    await expect(agent.fetchSubnetKeys(anotherCanisterId)).rejects.toThrow(
      TrustError.fromCode(
        new CertificateNotAuthorizedErrorCode(
          anotherCanisterId,
          Principal.selfAuthenticating(rootSubnetKeyPair.publicKeyDer),
        ),
      ),
    );
    expect(mockReplica.getV3ReadStateSpy(anotherCanisterId.toString())).toHaveBeenCalledTimes(1);
  });
});

describe('fetchSubnetKeys (delegated subnet)', () => {
  const now = new Date('2025-12-16T06:34:56.789Z');
  const canisterId = Principal.fromText('v2nog-2aaaa-aaaab-p777q-cai');

  const rootSubnetKeyPair = randomKeyPair();
  const subnetKeyPair = randomKeyPair();
  const nodeIdentity = randomIdentity();
  const identity = randomIdentity();

  let mockReplica: MockReplica;

  beforeEach(async () => {
    mockReplica = await MockReplica.create();

    vi.setSystemTime(now);
  });

  it('should verify that the canister is in the allowed canister ranges', async () => {
    const agent = await HttpAgent.create({
      host: mockReplica.address,
      rootKey: rootSubnetKeyPair.publicKeyDer,
      identity,
    });

    const { responseBody: readStateResponseBody } = await prepareV3ReadStateResponse({
      nodeIdentity,
      canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
      rootSubnetKeyPair,
      keyPair: subnetKeyPair,
      date: now,
    });
    mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
      res.status(200).send(readStateResponseBody);
    });

    const nodeKeys = await agent.fetchSubnetKeys(canisterId);

    const expectedNodeKey = nodeIdentity.getPublicKey().toDer();
    expect(nodeKeys.get(nodeIdentity.getPrincipal().toText())).toEqual(expectedNodeKey);
    expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
  });

  it('should throw if the canister is not in the allowed canister ranges', async () => {
    const agent = await HttpAgent.create({
      host: mockReplica.address,
      rootKey: rootSubnetKeyPair.publicKeyDer,
      identity,
    });
    const anotherCanisterId = Principal.fromText('jrlun-jiaaa-aaaab-aaaaa-cai');

    const { responseBody: readStateResponseBody } = await prepareV3ReadStateResponse({
      nodeIdentity,
      canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
      rootSubnetKeyPair,
      keyPair: subnetKeyPair,
      date: now,
    });
    mockReplica.setV3ReadStateSpyImplOnce(anotherCanisterId.toString(), (_req, res) => {
      res.status(200).send(readStateResponseBody);
    });

    await expect(agent.fetchSubnetKeys(anotherCanisterId)).rejects.toThrow(
      TrustError.fromCode(
        new CertificateNotAuthorizedErrorCode(
          anotherCanisterId,
          Principal.selfAuthenticating(subnetKeyPair.publicKeyDer),
        ),
      ),
    );
    expect(mockReplica.getV3ReadStateSpy(anotherCanisterId.toString())).toHaveBeenCalledTimes(1);
  });
});
