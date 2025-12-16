import {
  AgentError,
  CanisterStatus,
  CertificateTimeErrorCode,
  HttpAgent,
  TrustError,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { makeAgent } from '../utils/agent.ts';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCanisterId } from '../utils/canisterid.ts';
import {
  MockReplica,
  mockSyncTimeResponse,
  prepareV3ReadStateResponse,
} from '../utils/mock-replica.ts';
import { randomIdentity, randomKeyPair } from '../utils/identity.ts';

const MINUTE_TO_MSECS = 60 * 1000;

describe('canister status', () => {
  it('should fetch successfully', async () => {
    const counterCanisterId = getCanisterId('counter');
    const agent = await makeAgent();
    await agent.fetchRootKey();
    const request = await CanisterStatus.request({
      canisterId: counterCanisterId,
      agent,
      paths: ['controllers'],
    });

    expect(Array.isArray(request.get('controllers'))).toBe(true);
  });
  it('should throw an error if fetchRootKey has not been called', async () => {
    const counterCanisterId = getCanisterId('counter');
    const agent = HttpAgent.createSync({
      host: `http://127.0.0.1:${process.env.REPLICA_PORT ?? 4943}`,
      verifyQuerySignatures: false,
    });
    expect.assertions(1);
    try {
      await CanisterStatus.request({
        canisterId: counterCanisterId,
        agent,
        paths: ['controllers'],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
    }
  });
  it('should fetch the subnet id of a given canister', async () => {
    const counterCanisterId = getCanisterId('counter');
    const agent = await makeAgent();
    await agent.fetchRootKey();
    const statusMap = await CanisterStatus.request({
      canisterId: counterCanisterId,
      agent,
      paths: ['subnet'],
    });

    const subnet = statusMap.get('subnet') as CanisterStatus.SubnetStatus;

    expect(subnet).toBeDefined();

    const principal = Principal.fromText(subnet.subnetId);
    expect(principal).toBeDefined();
  });

  describe('certificate freshness', () => {
    const now = new Date('2025-07-25T12:34:56.789Z');
    const canisterId = Principal.fromText('uxrrr-q7777-77774-qaaaq-cai');

    const rootSubnetKeyPair = randomKeyPair();
    const subnetKeyPair = randomKeyPair();
    const nodeIdentity = randomIdentity();
    const identity = randomIdentity();

    let mockReplica: MockReplica;

    beforeEach(async () => {
      mockReplica = await MockReplica.create();

      vi.setSystemTime(now);
    });

    it('should sync time and throw an error if the certificate is not fresh', async () => {
      const timeDiffMsecs = -(6 * MINUTE_TO_MSECS);
      const replicaDate = new Date(now.getTime() + timeDiffMsecs);

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: rootSubnetKeyPair.publicKeyDer,
        identity,
      });

      const { responseBody: subnetResponseBody } = await prepareV3ReadStateResponse({
        nodeIdentity,
        canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
        rootSubnetKeyPair,
        keyPair: subnetKeyPair,
        date: replicaDate,
      });
      // first try, fails
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(subnetResponseBody);
      });
      // syncs time
      await mockSyncTimeResponse({
        mockReplica,
        rootSubnetKeyPair,
        keyPair: subnetKeyPair,
        canisterId,
        date: now, // simulate a replica time that is different from the certificate time
      });

      expect.assertions(4);

      try {
        await CanisterStatus.request({
          canisterId,
          agent,
          paths: ['subnet'],
        });
      } catch (e) {
        expect(e).toBeInstanceOf(TrustError);
        const err = e as TrustError;
        expect(err.cause.code).toBeInstanceOf(CertificateTimeErrorCode);
        expect(err.message).toContain('Certificate is signed more than 5 minutes in the past');
      }
      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(4);
    });

    it('should sync time and succeed if the certificate is not fresh', async () => {
      const timeDiffMsecs = -(6 * MINUTE_TO_MSECS);
      const replicaDate = new Date(now.getTime() + timeDiffMsecs);

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: rootSubnetKeyPair.publicKeyDer,
        identity,
      });

      const { responseBody: subnetResponseBody } = await prepareV3ReadStateResponse({
        nodeIdentity,
        canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
        rootSubnetKeyPair,
        keyPair: subnetKeyPair,
        date: replicaDate,
      });
      // first try, fails
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(subnetResponseBody);
      });
      // sync time, we return the replica date to make the agent sync time properly
      await mockSyncTimeResponse({
        mockReplica,
        rootSubnetKeyPair,
        keyPair: subnetKeyPair,
        canisterId,
        date: new Date(now.getTime() - 4 * MINUTE_TO_MSECS),
      });

      await expect(
        CanisterStatus.request({
          canisterId,
          agent,
          paths: ['subnet'],
        }),
      ).resolves.not.toThrow();
      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(4);
    });

    it('should not sync time and succeed if the certificate is not fresh and disableTimeVerification is true', async () => {
      const timeDiffMsecs = -(6 * MINUTE_TO_MSECS);
      const replicaDate = new Date(now.getTime() + timeDiffMsecs);

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: rootSubnetKeyPair.publicKeyDer,
        identity,
      });

      const { responseBody: subnetResponseBody } = await prepareV3ReadStateResponse({
        nodeIdentity,
        canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
        rootSubnetKeyPair,
        keyPair: subnetKeyPair,
        date: replicaDate,
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(subnetResponseBody);
      });

      await expect(
        CanisterStatus.request({
          canisterId,
          agent,
          paths: ['subnet'],
          disableCertificateTimeVerification: true,
        }),
      ).resolves.not.toThrow();
      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
    });
  });
});
