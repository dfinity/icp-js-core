import express, { Express, Request, Response } from 'express';
import {
  CallRequest,
  Cbor,
  requestIdOf,
  SubmitRequestType,
  v4ResponseBody,
  calculateIngressExpiry,
  Cert,
  reconstruct,
  Nonce,
  RequestId,
  ReadStateResponse,
  HashTree,
  Signed,
  UnSigned,
  ReadStateRequest,
  QueryRequest,
  hashOfMap,
  QueryResponseReplied,
  IC_RESPONSE_DOMAIN_SEPARATOR,
  IC_STATE_ROOT_DOMAIN_SEPARATOR,
  QueryResponseStatus,
  ReadRequestType,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { Mock, vi } from 'vitest';
import { createReplyTree, createSubnetTree } from './tree.ts';
import { randomKeyPair, signBls, KeyPair, randomIdentity } from './identity.ts';
import { concatBytes, toBytes } from '@noble/hashes/utils';

const NANOSECONDS_TO_MSECS = 1_000_000;

export enum MockReplicaSpyType {
  CallV4 = 'CallV4',
  ReadStateV3 = 'ReadStateV3',
  ReadSubnetStateV3 = 'ReadSubnetStateV3',
  QueryV3 = 'QueryV3',
}

type MockReplicaRequestParams = { canisterId: string } | { subnetId: string };

export type MockReplicaRequest = Request<MockReplicaRequestParams, Uint8Array, Uint8Array>;
export type MockReplicaResponse = Response<Uint8Array | string>;

export type MockReplicaSpyImpl = (req: MockReplicaRequest, res: MockReplicaResponse) => void;
export type MockReplicaSpy = Mock<MockReplicaSpyImpl>;

export interface MockReplicaSpies {
  [MockReplicaSpyType.CallV4]?: MockReplicaSpy;
  [MockReplicaSpyType.ReadStateV3]?: MockReplicaSpy;
  [MockReplicaSpyType.ReadSubnetStateV3]?: MockReplicaSpy;
  [MockReplicaSpyType.QueryV3]?: MockReplicaSpy;
}

function fallbackSpyImpl(spyType: MockReplicaSpyType, principal: string): MockReplicaSpyImpl {
  return (req, res) => {
    res
      .status(500)
      .send(
        `No implementation defined for ${spyType} spy on principal: ${principal}. Requested path: ${req.path}`,
      );
  };
}

export class MockReplica {
  readonly #listeners: Map<string, MockReplicaSpies> = new Map();

  private constructor(
    app: Express,
    public readonly address: string,
  ) {
    app.use(express.raw({ type: 'application/cbor' }));
    app.post(
      '/api/v4/canister/:canisterId/call',
      this.#createEndpointSpy(MockReplicaSpyType.CallV4),
    );
    app.post(
      '/api/v3/canister/:canisterId/read_state',
      this.#createEndpointSpy(MockReplicaSpyType.ReadStateV3),
    );
    app.post(
      '/api/v3/subnet/:subnetId/read_state',
      this.#createEndpointSpy(MockReplicaSpyType.ReadSubnetStateV3),
    );
    app.post(
      '/api/v3/canister/:canisterId/query',
      this.#createEndpointSpy(MockReplicaSpyType.QueryV3),
    );
  }

  public static async create(): Promise<MockReplica> {
    const app = express();

    return new Promise(resolve => {
      const server = app.listen(0, 'localhost', () => {
        const address = server.address();
        if (address === null) {
          throw new Error('Failed to get server address.');
        }

        const strAddress =
          typeof address === 'string' ? address : `http://localhost:${address.port}`;

        const mockReplica = new MockReplica(app, strAddress);
        resolve(mockReplica);
      });
    });
  }

  public setV4CallSpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.CallV4, impl);
  }

  public setV3ReadStateSpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.ReadStateV3, impl);
  }

  public setV3ReadSubnetStateSpyImplOnce(subnetId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(subnetId, MockReplicaSpyType.ReadSubnetStateV3, impl);
  }

  public setV3QuerySpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.QueryV3, impl);
  }

  public getV4CallSpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.CallV4);
  }

  public getV3ReadStateSpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.ReadStateV3);
  }

  public getV3ReadSubnetStateSpy(subnetId: string): MockReplicaSpy {
    return this.#getSpy(subnetId, MockReplicaSpyType.ReadSubnetStateV3);
  }

  public getV3QuerySpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.QueryV3);
  }

  public getV4CallReq(canisterId: string, callNumber: number): Signed<CallRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.CallV4);

    return Cbor.decode<Signed<CallRequest>>(req.body);
  }

  public getV3ReadStateReq(canisterId: string, callNumber: number): UnSigned<ReadStateRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.ReadStateV3);

    return Cbor.decode<UnSigned<ReadStateRequest>>(req.body);
  }

  public getV3ReadSubnetStateReq(subnetId: string, callNumber: number): UnSigned<ReadStateRequest> {
    const [req] = this.#getCallParams(subnetId, callNumber, MockReplicaSpyType.ReadSubnetStateV3);

    return Cbor.decode<UnSigned<ReadStateRequest>>(req.body);
  }

  public getV3QueryReq(canisterId: string, callNumber: number): UnSigned<QueryRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.QueryV3);

    return Cbor.decode<UnSigned<QueryRequest>>(req.body);
  }

  #createEndpointSpy(spyType: MockReplicaSpyType): MockReplicaSpyImpl {
    return (req, res) => {
      let principal: string;
      if ('canisterId' in req.params) {
        principal = req.params.canisterId;
      } else if ('subnetId' in req.params) {
        principal = req.params.subnetId;
      } else {
        res.status(500).send('No canisterId or subnetId found in request.');
        return;
      }

      const principalSpies = this.#listeners.get(principal);
      if (!principalSpies) {
        res.status(500).send(`No listeners defined for principal: ${principal}.`);
        return;
      }

      const spy = principalSpies[spyType];
      if (!spy) {
        res.status(500).send(`No ${spyType} spy defined for principal: ${principal}.`);
        return;
      }

      // add fallback implementation to return 500 if the spy runs out of implementations
      spy.mockImplementation(fallbackSpyImpl(spyType, principal));

      spy(req, res);
    };
  }

  #setSpyImplOnce(principal: string, spyType: MockReplicaSpyType, impl: MockReplicaSpyImpl): void {
    const map: MockReplicaSpies = this.#listeners.get(principal.toString()) ?? {};
    const spy = map[spyType] ?? vi.fn();

    spy.mockImplementationOnce(impl);

    map[spyType] = spy;
    this.#listeners.set(principal.toString(), map);
  }

  #getSpy(principal: string, spyType: MockReplicaSpyType): MockReplicaSpy {
    const principalSpies = this.#listeners.get(principal);
    if (!principalSpies) {
      throw new Error(`No listeners defined for principal: ${principal}.`);
    }

    const spy = principalSpies[spyType];
    if (!spy) {
      throw new Error(`No ${spyType} spy defined for principal: ${principal}.`);
    }

    return spy;
  }

  #getCallParams(
    principal: string,
    callNumber: number,
    spyType: MockReplicaSpyType,
  ): [MockReplicaRequest, MockReplicaResponse] {
    const spy = this.#getSpy(principal, spyType);
    if (!spy.mock.calls.length) {
      throw new Error(`No calls found for principal: ${principal}.`);
    }

    const callParams = spy.mock.calls[callNumber];
    if (!callParams) {
      throw new Error(
        `No call params found for principal: ${principal}, callNumber: ${callNumber}. Actual number of calls is ${spy.mock.calls.length}.`,
      );
    }
    if (!callParams[0]) {
      throw new Error(`No request found for principal: ${principal}, callNumber: ${callNumber}.`);
    }
    if (!callParams[1]) {
      throw new Error(`No response found for principal: ${principal}, callNumber: ${callNumber}.`);
    }

    return callParams;
  }
}

interface V4ResponseOptions {
  canisterId: Principal | string;
  methodName: string;
  arg: Uint8Array;
  sender: Principal | string;
  ingressExpiryInMinutes?: number;
  timeDiffMsecs?: number;
  reply?: string | Uint8Array;
  rootSubnetKeyPair: KeyPair;
  keyPair?: KeyPair;
  date?: Date;
  nonce?: Nonce;
}

interface V4Response {
  responseBody: Uint8Array;
  requestId: RequestId;
}

/**
 * Prepares a version 3 response for a canister call.
 * @param {V4ResponseOptions} options - The options for preparing the response.
 * @param {string} options.canisterId - The ID of the canister.
 * @param {string} options.methodName - The name of the method being called.
 * @param {Uint8Array} options.arg - The arguments for the method call.
 * @param {string} options.sender - The principal ID of the sender.
 * @param {number} options.ingressExpiryInMinutes - The ingress expiry time in minutes.
 * @param {number} options.timeDiffMsecs - The time difference in milliseconds.
 * @param {Uint8Array} options.reply - The reply payload.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {Date} options.date - The date of the request.
 * @param {Uint8Array} options.nonce - The nonce for the request.
 * @returns {Promise<V4Response>} A promise that resolves to the prepared response.
 */
export async function prepareV4Response({
  canisterId,
  methodName,
  arg,
  sender,
  ingressExpiryInMinutes,
  timeDiffMsecs,
  reply,
  rootSubnetKeyPair,
  keyPair,
  date,
  nonce,
}: V4ResponseOptions): Promise<V4Response> {
  canisterId = Principal.from(canisterId);
  sender = Principal.from(sender);
  ingressExpiryInMinutes = ingressExpiryInMinutes ?? 5;
  timeDiffMsecs = timeDiffMsecs ?? 0;
  reply = reply ?? new Uint8Array();
  keyPair = keyPair ?? randomKeyPair();
  date = date ?? new Date();

  const ingressExpiry = calculateIngressExpiry(ingressExpiryInMinutes, timeDiffMsecs);
  const callRequest: CallRequest = {
    request_type: SubmitRequestType.Call,
    canister_id: canisterId,
    method_name: methodName,
    arg,
    sender,
    ingress_expiry: ingressExpiry,
    nonce,
  };
  const requestId = requestIdOf(callRequest);

  const tree = createReplyTree({
    requestId,
    reply,
    date,
  });
  const signature = await signTree(tree, keyPair);
  const delegation = await createDelegationCertificate({
    delegatedKeyPair: keyPair,
    keyPair: rootSubnetKeyPair,
    canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
    date,
  });

  const cert: Cert = {
    tree,
    signature,
    delegation,
  };
  const responseBody: v4ResponseBody = {
    certificate: Cbor.encode(cert),
  };

  return {
    responseBody: Cbor.encode(responseBody),
    requestId,
  };
}

export interface V3ReadStateResponse {
  responseBody: Uint8Array;
}

interface V3ReadStateOptions {
  nodeIdentity: Ed25519KeyIdentity;
  canisterRanges: Array<[Uint8Array, Uint8Array]>;
  rootSubnetKeyPair: KeyPair;
  keyPair?: KeyPair;
  date?: Date;
}

/**
 * Prepares a version 3 read state subnet response.
 * @param {V3ReadStateOptions} options - The options for preparing the response.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {Array<[Uint8Array, Uint8Array]>} options.canisterRanges - The canister ranges for the subnet.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {Date} options.date - The date for the response.
 * @returns {Promise<V3ReadStateResponse>} A promise that resolves to the prepared response.
 */
export async function prepareV3ReadStateResponse({
  nodeIdentity,
  canisterRanges,
  rootSubnetKeyPair,
  keyPair,
  date,
}: V3ReadStateOptions): Promise<V3ReadStateResponse> {
  keyPair = keyPair ?? randomKeyPair();
  date = date ?? new Date();

  const subnetId = Principal.selfAuthenticating(keyPair.publicKeyDer).toUint8Array();

  const tree = createSubnetTree({
    subnetId,
    subnetPublicKey: keyPair.publicKeyDer,
    nodeIdentity,
    canisterRanges,
    date,
  });
  const signature = await signTree(tree, keyPair);
  const delegation = await createDelegationCertificate({
    delegatedKeyPair: keyPair,
    keyPair: rootSubnetKeyPair,
    canisterRanges,
    date,
  });

  const cert: Cert = {
    tree,
    signature,
    delegation,
  };
  const responseBody: ReadStateResponse = {
    certificate: Cbor.encode(cert),
  };

  return {
    responseBody: Cbor.encode(responseBody),
  };
}

/**
 * Prepares a version 3 read state subnet response.
 * @param {V3ReadStateOptions} options - The options for preparing the response.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {Array<[Uint8Array, Uint8Array]>} options.canisterRanges - The canister ranges for the subnet.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {Date} options.date - The date for the response.
 * @returns {Promise<V3ReadStateResponse>} A promise that resolves to the prepared response.
 */
export async function prepareV3ReadStateSubnetResponse({
  nodeIdentity,
  canisterRanges,
  rootSubnetKeyPair,
  keyPair,
  date,
}: V3ReadStateOptions): Promise<V3ReadStateResponse> {
  keyPair = keyPair ?? randomKeyPair();
  date = date ?? new Date();
  const subnetId = Principal.selfAuthenticating(keyPair.publicKeyDer).toUint8Array();

  const tree = createSubnetTree({
    subnetId,
    subnetPublicKey: keyPair.publicKeyDer,
    nodeIdentity,
    canisterRanges,
    date,
  });
  const signature = await signTree(tree, keyPair);
  const delegation = await createDelegationCertificate({
    delegatedKeyPair: keyPair,
    keyPair: rootSubnetKeyPair,
    canisterRanges,
    date,
  });

  const cert: Cert = {
    tree,
    signature,
    delegation,
  };
  const responseBody: ReadStateResponse = {
    certificate: Cbor.encode(cert),
  };

  return {
    responseBody: Cbor.encode(responseBody),
  };
}

interface V3QueryResponseOptions {
  canisterId: Principal | string;
  methodName: string;
  arg: Uint8Array;
  sender: Principal | string;
  nodeIdentity: Ed25519KeyIdentity;
  ingressExpiryInMinutes?: number;
  timeDiffMsecs?: number;
  reply?: string | Uint8Array;
  date?: Date;
}

interface V3QueryResponse {
  responseBody: Uint8Array;
  requestId: RequestId;
}

/**
 * Prepares a version 2 query response.
 * @param {V3QueryResponseOptions} options - The options for preparing the response.
 * @param {string} options.canisterId - The ID of the canister.
 * @param {string} options.methodName - The name of the method being called.
 * @param {Uint8Array} options.arg - The arguments for the method call.
 * @param {string} options.sender - The principal ID of the sender.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {number} options.ingressExpiryInMinutes - The ingress expiry time in minutes.
 * @param {number} options.timeDiffMsecs - The time difference in milliseconds.
 * @param {Uint8Array} options.reply - The reply payload.
 * @param {Date} options.date - The date for the response.
 * @returns {Promise<V3QueryResponse>} A promise that resolves to the prepared response.
 */
export async function prepareV3QueryResponse({
  canisterId,
  methodName,
  arg,
  sender,
  nodeIdentity,
  ingressExpiryInMinutes,
  timeDiffMsecs,
  reply,
  date,
}: V3QueryResponseOptions): Promise<V3QueryResponse> {
  canisterId = Principal.from(canisterId);
  sender = Principal.from(sender);
  ingressExpiryInMinutes = ingressExpiryInMinutes ?? 5;
  timeDiffMsecs = timeDiffMsecs ?? 0;
  const coercedReply = reply ? toBytes(reply) : new Uint8Array();
  date = date ?? new Date();

  const ingressExpiry = calculateIngressExpiry(ingressExpiryInMinutes, timeDiffMsecs);
  const queryRequest: QueryRequest = {
    request_type: ReadRequestType.Query,
    canister_id: canisterId,
    method_name: methodName,
    arg,
    sender,
    ingress_expiry: ingressExpiry,
  };

  const requestId = requestIdOf(queryRequest);
  const timestamp = BigInt(date.getTime()) * BigInt(NANOSECONDS_TO_MSECS);

  const message = createQueryReplyMessage({
    requestId,
    status: QueryResponseStatus.Replied,
    reply: coercedReply,
    timestamp,
  });
  const signature = await nodeIdentity.sign(message);

  const body: QueryResponseReplied = {
    status: QueryResponseStatus.Replied,
    reply: { arg: coercedReply },
    signatures: [
      {
        timestamp,
        signature,
        identity: nodeIdentity.getPrincipal().toUint8Array(),
      },
    ],
  };

  return {
    responseBody: Cbor.encode(body),
    requestId,
  };
}

function createQueryReplyMessage({
  requestId,
  status,
  reply,
  timestamp,
}: {
  requestId: RequestId;
  status: QueryResponseStatus;
  reply: Uint8Array;
  timestamp: bigint;
}): Uint8Array {
  const hash = hashOfMap({
    status,
    reply: { arg: reply },
    timestamp,
    request_id: requestId,
  });

  return concatBytes(IC_RESPONSE_DOMAIN_SEPARATOR, hash);
}

async function signTree(tree: HashTree, keyPair: KeyPair): Promise<Uint8Array> {
  const rootHash = await reconstruct(tree);
  const msg = concatBytes(IC_STATE_ROOT_DOMAIN_SEPARATOR, rootHash);
  return signBls(msg, keyPair.privateKey);
}

type MockSyncTimeResponseOptions = {
  mockReplica: MockReplica;
  rootSubnetKeyPair: KeyPair;
  keyPair: KeyPair;
  canisterId: Principal | string;
  date?: Date;
};

/**
 * A shortcut to prepare the mock replica to respond to the sync time request.
 * It mocks the read state endpoint 3 times.
 * @param {MockSyncTimeResponseOptions} options - The options for preparing the response.
 * @param {MockReplica} options.mockReplica - The mock replica to prepare.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {string} options.canisterId - The ID of the canister.
 * @param {Date} options.date - The date to use for the returned certificate `time` field. Optional.
 */
export async function mockSyncTimeResponse({
  mockReplica,
  rootSubnetKeyPair,
  keyPair,
  date,
  canisterId,
}: MockSyncTimeResponseOptions) {
  canisterId = Principal.from(canisterId);
  const { responseBody: timeResponseBody } = await prepareV3ReadStateResponse({
    rootSubnetKeyPair,
    keyPair,
    date,
    canisterRanges: [[canisterId.toUint8Array(), canisterId.toUint8Array()]],
    nodeIdentity: randomIdentity(),
  });
  const canisterIdString = canisterId.toString();
  mockReplica.setV3ReadStateSpyImplOnce(canisterIdString, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterIdString, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterIdString, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
}

type MockSyncSubnetTimeResponseOptions = {
  mockReplica: MockReplica;
  rootSubnetKeyPair: KeyPair;
  keyPair: KeyPair;
  date?: Date;
};

/**
 * A shortcut to prepare the mock replica to respond to the sync subnet time request.
 * It mocks the read subnet state endpoint 3 times.
 * @param {MockSyncTimeResponseOptions} options - The options for preparing the response.
 * @param {MockReplica} options.mockReplica - The mock replica to prepare.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {Date} options.date - The date to use for the returned certificate `time` field. Optional.
 */
export async function mockSyncSubnetTimeResponse({
  mockReplica,
  rootSubnetKeyPair,
  keyPair,
  date,
}: MockSyncSubnetTimeResponseOptions) {
  const subnetId = Principal.selfAuthenticating(keyPair.publicKeyDer);
  const { responseBody: subnetResponseBody } = await prepareV3ReadStateSubnetResponse({
    rootSubnetKeyPair,
    keyPair,
    date,
    canisterRanges: [], // not needed for subnet time
    nodeIdentity: randomIdentity(),
  });

  const subnetIdString = subnetId.toString();
  mockReplica.setV3ReadSubnetStateSpyImplOnce(subnetIdString, (_req, res) => {
    res.status(200).send(subnetResponseBody);
  });
  mockReplica.setV3ReadSubnetStateSpyImplOnce(subnetIdString, (_req, res) => {
    res.status(200).send(subnetResponseBody);
  });
  mockReplica.setV3ReadSubnetStateSpyImplOnce(subnetIdString, (_req, res) => {
    res.status(200).send(subnetResponseBody);
  });
}

type CreateDelegationCertificateOptions = {
  delegatedKeyPair: KeyPair;
  keyPair: KeyPair;
  canisterRanges: Array<[Uint8Array, Uint8Array]>;
  date?: Date;
};

async function createDelegationCertificate({
  delegatedKeyPair,
  keyPair,
  canisterRanges,
  date,
}: CreateDelegationCertificateOptions): Promise<NonNullable<Cert['delegation']>> {
  date = date ?? new Date();
  const delegatedSubnetId = Principal.selfAuthenticating(
    delegatedKeyPair.publicKeyDer,
  ).toUint8Array();

  const tree = createSubnetTree({
    subnetId: delegatedSubnetId,
    subnetPublicKey: delegatedKeyPair.publicKeyDer,
    canisterRanges,
    date,
  });
  const signature = await signTree(tree, keyPair);

  const cert: Cert = {
    tree,
    signature,
  };

  return {
    subnet_id: delegatedSubnetId,
    certificate: Cbor.encode(cert),
  };
}

type MockReadStateNodeKeysResponseOptions = {
  mockReplica: MockReplica;
  nodeIdentity: Ed25519KeyIdentity;
  canisterId: Principal | string;
  rootSubnetKeyPair: KeyPair;
  subnetKeyPair: KeyPair;
  date?: Date;
};

/**
 * A shortcut to prepare the mock replica to respond to the read state node keys request.
 * Prepares one read state and one read subnet state response.
 * @param {MockReadStateNodeKeysResponseOptions} options - The options for preparing the response.
 * @param {MockReplica} options.mockReplica - The mock replica to prepare.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {string} options.canisterId - The ID of the canister.
 * @param {KeyPair} options.subnetKeyPair - The key pair for signing the subnet.
 * @param {Date} options.date - The date to use for the returned certificate `time` field. Optional.
 */
export async function mockReadStateNodeKeysResponse({
  mockReplica,
  nodeIdentity,
  canisterId,
  rootSubnetKeyPair,
  subnetKeyPair,
  date,
}: MockReadStateNodeKeysResponseOptions) {
  canisterId = Principal.from(canisterId);
  const canisterIdBytes = canisterId.toUint8Array();

  const { responseBody: readStateResponseBody } = await prepareV3ReadStateResponse({
    nodeIdentity,
    canisterRanges: [[canisterIdBytes, canisterIdBytes]],
    rootSubnetKeyPair,
    keyPair: subnetKeyPair,
    date,
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterId.toString(), (_req, res) => {
    res.status(200).send(readStateResponseBody);
  });
}
