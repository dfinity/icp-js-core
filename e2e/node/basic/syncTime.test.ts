import {
  AnonymousIdentity,
  CallRequest,
  HttpAgent,
  IC_REQUEST_DOMAIN_SEPARATOR,
  IngressExpiryInvalidErrorCode,
  InputError,
  makeNonce,
  Nonce,
  ReadStateRequest,
  Signature,
  Signed,
  UnSigned,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { IDL } from '@icp-sdk/core/candid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from '../canisters/counter.ts';
import {
  MockReplica,
  mockSyncTimeResponse,
  prepareV3ReadStateResponse,
  prepareV4Response,
} from '../utils/mock-replica.ts';
import { randomIdentity, randomKeyPair } from '../utils/identity.ts';
import { concatBytes } from '@noble/hashes/utils';

const INVALID_EXPIRY_ERROR =
  'Invalid request expiry: Specified ingress_expiry not within expected range: Minimum allowed expiry: 2025-05-01 23:55:18.005285297 UTC, Maximum allowed expiry: 2025-05-02 00:00:48.005285297 UTC, Provided expiry: 2025-05-01 12:38:00 UTC';

describe('syncTime', () => {
  const date = new Date('2025-05-01T12:34:56.789Z');
  const canisterId = Principal.fromText('uxrrr-q7777-77774-qaaaq-cai');
  const canisterRanges: Array<[Uint8Array, Uint8Array]> = [
    [canisterId.toUint8Array(), canisterId.toUint8Array()],
  ];
  const nonce = makeNonce();

  const ICP_LEDGER = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
  const icpLedgerCanisterRanges: Array<[Uint8Array, Uint8Array]> = [
    [Principal.fromText(ICP_LEDGER).toUint8Array(), Principal.fromText(ICP_LEDGER).toUint8Array()],
  ];

  const greetMethodName = 'greet';
  const greetReq = 'world';
  const greetRes = 'Hello, world!';
  const greetArgs = IDL.encode([IDL.Text], [greetReq]);
  const greetReply = IDL.encode([IDL.Text], [greetRes]);

  const keyPair = randomKeyPair();
  const identity = randomIdentity();
  const nodeIdentity = randomIdentity();
  const anonIdentity = new AnonymousIdentity();

  let mockReplica: MockReplica;

  beforeEach(async () => {
    mockReplica = await MockReplica.create();

    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('on error', () => {
    it('should not sync time by default', async () => {
      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
      });
      const actor = await createActor(canisterId, { agent });
      const sender = identity.getPrincipal();

      const { responseBody, requestId } = await prepareV4Response({
        canisterId,
        methodName: greetMethodName,
        arg: greetArgs,
        sender,
        reply: greetReply,
        keyPair,
        date,
        nonce,
      });
      const signature = await identity.sign(concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, requestId));
      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(responseBody);
      });

      const actorResponse = await actor.greet.withOptions({ nonce })(greetReq);
      expect(actorResponse).toEqual(greetRes);

      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
      expectV4CallRequest(
        mockReplica.getV4CallReq(canisterId.toString(), 0),
        {
          nonce,
          sender,
          pubKey: identity.getPublicKey().toDer(),
          signature,
        },
        'V4 call body',
      );
      expect(agent.hasSyncedTime()).toBe(false);
    });

    it('should sync time when the local time does not match the subnet time', async () => {
      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
      });
      const actor = await createActor(canisterId, { agent });
      const sender = identity.getPrincipal();

      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(400).send(new TextEncoder().encode(INVALID_EXPIRY_ERROR));
      });

      await mockSyncTimeResponse({
        mockReplica,
        keyPair,
        canisterId,
      });

      const { responseBody: callResponse, requestId } = await prepareV4Response({
        canisterId,
        methodName: greetMethodName,
        arg: greetArgs,
        sender,
        reply: greetReply,
        keyPair,
        date,
        nonce,
      });
      const signature = await identity.sign(concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, requestId));
      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(callResponse);
      });

      const actorResponse = await actor.greet.withOptions({ nonce })(greetReq);

      expect(actorResponse).toEqual(greetRes);
      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(2);

      const req = mockReplica.getV4CallReq(canisterId.toString(), 0);
      expectV4CallRequest(
        req,
        {
          nonce,
          sender,
          pubKey: identity.getPublicKey().toDer(),
          signature,
        },
        'V4 call body',
      );

      const reqTwo = mockReplica.getV4CallReq(canisterId.toString(), 1);
      expect(reqTwo).toEqual(req);

      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(3);
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 0),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V3 read state body one',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 1),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body two',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 2),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body three',
      );
      expect(agent.hasSyncedTime()).toBe(true);
    });

    it('should not sync time twice when the local time does not match the subnet time', async () => {
      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
      });
      const actor = await createActor(canisterId, { agent });

      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(400).send(new TextEncoder().encode(INVALID_EXPIRY_ERROR));
      });

      await mockSyncTimeResponse({
        mockReplica,
        keyPair,
        canisterId,
      });

      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(400).send(new TextEncoder().encode(INVALID_EXPIRY_ERROR));
      });

      expect.assertions(6);

      try {
        await actor.greet(greetReq);
      } catch (e) {
        expect(e).toBeInstanceOf(InputError);
        const err = e as InputError;
        expect(err.cause.code).toBeInstanceOf(IngressExpiryInvalidErrorCode);
        expect(err.message).toBe(
          `${INVALID_EXPIRY_ERROR}. Provided ingress expiry time is 5 minutes.`,
        );
      }

      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(2);
      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(3);
      expect(agent.hasSyncedTime()).toBe(true);
    });
  });

  describe('on async creation', () => {
    it('should sync time on when enabled', async () => {
      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges: icpLedgerCanisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(ICP_LEDGER, (_req, res) => {
        res.status(200).send(readStateResponse);
      });
      mockReplica.setV3ReadStateSpyImplOnce(ICP_LEDGER, (_req, res) => {
        res.status(200).send(readStateResponse);
      });
      mockReplica.setV3ReadStateSpyImplOnce(ICP_LEDGER, (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        shouldSyncTime: true,
      });

      expect(mockReplica.getV3ReadStateSpy(ICP_LEDGER)).toHaveBeenCalledTimes(3);
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(ICP_LEDGER, 0),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body one',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(ICP_LEDGER, 1),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body two',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(ICP_LEDGER, 2),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body three',
      );
      expect(agent.hasSyncedTime()).toBe(true);
    });

    it('should not sync time by default', async () => {
      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges: icpLedgerCanisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(ICP_LEDGER, (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        shouldSyncTime: false,
        identity: anonIdentity,
      });

      expect(mockReplica.getV3ReadStateSpy(ICP_LEDGER)).toHaveBeenCalledTimes(0);
      expect(agent.hasSyncedTime()).toBe(false);
    });

    it('should not sync time when explicitly disabled', async () => {
      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges: icpLedgerCanisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(ICP_LEDGER, (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const agent = await HttpAgent.create({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        shouldSyncTime: false,
        identity: anonIdentity,
      });

      expect(mockReplica.getV3ReadStateSpy(ICP_LEDGER)).toHaveBeenCalledTimes(0);
      expect(agent.hasSyncedTime()).toBe(false);
    });
  });

  describe('on first call', () => {
    it('should sync time when enabled', async () => {
      const agent = HttpAgent.createSync({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
        shouldSyncTime: true,
      });
      const actor = await createActor(canisterId, { agent });

      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(readStateResponse);
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(readStateResponse);
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const { responseBody, requestId } = await prepareV4Response({
        canisterId,
        methodName: greetMethodName,
        arg: greetArgs,
        sender: identity.getPrincipal(),
        reply: greetReply,
        keyPair,
        date,
        nonce,
      });
      const signature = await identity.sign(concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, requestId));
      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(responseBody);
      });

      const actorResponse = await actor.greet.withOptions({ nonce })(greetReq);
      expect(actorResponse).toEqual(greetRes);

      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
      const req = mockReplica.getV4CallReq(canisterId.toString(), 0);
      expectV4CallRequest(
        req,
        {
          nonce,
          sender: identity.getPrincipal(),
          pubKey: identity.getPublicKey().toDer(),
          signature,
        },
        'V4 call body',
      );

      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(3);
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 0),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body one',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 1),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body two',
      );
      expectV3ReadStateRequest(
        mockReplica.getV3ReadStateReq(canisterId.toString(), 2),
        {
          sender: anonIdentity.getPrincipal(),
        },
        'V4 read state body three',
      );
      expect(agent.hasSyncedTime()).toBe(true);
    });

    it('should not sync time by default', async () => {
      const agent = HttpAgent.createSync({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
      });
      const actor = await createActor(canisterId, { agent });
      const sender = identity.getPrincipal();

      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const { responseBody, requestId } = await prepareV4Response({
        canisterId,
        methodName: greetMethodName,
        arg: greetArgs,
        sender,
        reply: greetReply,
        keyPair,
        date,
        nonce,
      });
      const signature = await identity.sign(concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, requestId));
      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(responseBody);
      });

      const actorResponse = await actor.greet.withOptions({ nonce })(greetReq);
      expect(actorResponse).toEqual(greetRes);

      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
      expectV4CallRequest(
        mockReplica.getV4CallReq(canisterId.toString(), 0),
        {
          nonce,
          sender,
          pubKey: identity.getPublicKey().toDer(),
          signature,
        },
        'V4 call body',
      );

      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(0);
      expect(agent.hasSyncedTime()).toBe(false);
    });

    it('should not sync time when explicitly disabled', async () => {
      const agent = HttpAgent.createSync({
        host: mockReplica.address,
        rootKey: keyPair.publicKeyDer,
        identity,
        shouldSyncTime: false,
      });
      const actor = await createActor(canisterId, { agent });
      const sender = identity.getPrincipal();

      const { responseBody: readStateResponse } = await prepareV3ReadStateResponse({
        keyPair,
        nodeIdentity,
        canisterRanges,
      });
      mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(readStateResponse);
      });

      const { responseBody, requestId } = await prepareV4Response({
        canisterId,
        methodName: greetMethodName,
        arg: greetArgs,
        sender,
        reply: greetReply,
        keyPair,
        date,
        nonce,
      });
      const signature = await identity.sign(concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, requestId));
      mockReplica.setV4CallSpyImplOnce(canisterId.toString(), (_req, res) => {
        res.status(200).send(responseBody);
      });

      const actorResponse = await actor.greet.withOptions({ nonce })(greetReq);
      expect(actorResponse).toEqual(greetRes);

      expect(mockReplica.getV4CallSpy(canisterId.toString())).toHaveBeenCalledTimes(1);
      const req = mockReplica.getV4CallReq(canisterId.toString(), 0);
      expectV4CallRequest(
        req,
        {
          nonce,
          sender,
          pubKey: identity.getPublicKey().toDer(),
          signature,
        },
        'V4 call body',
      );

      expect(mockReplica.getV3ReadStateSpy(canisterId.toString())).toHaveBeenCalledTimes(0);
      expect(agent.hasSyncedTime()).toBe(false);
    });
  });
});

interface ExpectedV4CallRequest {
  nonce: Nonce;
  sender: Principal;
  pubKey: Uint8Array;
  signature: Signature;
}

function expectV4CallRequest(
  actual: Signed<CallRequest>,
  expected: ExpectedV4CallRequest,
  snapshotName?: string,
) {
  expect(actual.content.nonce).toEqual(expected.nonce);
  expect(actual.content.sender).toEqual(expected.sender.toUint8Array());
  expect(actual.sender_pubkey).toEqual(expected.pubKey);
  expect(actual.sender_sig).toEqual(expected.signature);

  expect(actual).toMatchSnapshot(
    {
      content: {
        nonce: expect.any(Uint8Array),
        sender: expect.any(Uint8Array),
      },
      sender_pubkey: expect.any(Uint8Array),
      sender_sig: expect.any(Uint8Array),
    },
    snapshotName,
  );
}

interface ExpectedV3ReadStateRequest {
  sender: Principal;
}

function expectV3ReadStateRequest(
  actual: UnSigned<ReadStateRequest>,
  expected: ExpectedV3ReadStateRequest,
  snapshotName?: string,
) {
  expect(actual.content.sender).toEqual(expected.sender.toUint8Array());

  expect(actual).toMatchSnapshot(
    {
      content: {
        sender: expect.any(Uint8Array),
      },
    },
    snapshotName,
  );
}
