import express, { Express, Request, Response } from 'express';
import {
  CallRequest,
  Cbor,
  requestIdOf,
  SubmitRequestType,
  v3ResponseBody,
  calculateIngressExpiry,
  Cert,
  reconstruct,
  domain_sep,
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
  QueryResponseStatus,
  ReadRequestType,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { Mock, vi } from 'vitest';
import { createReplyTree, createSubnetTree, createTimeTree } from './tree.ts';
import { randomKeyPair, signBls, KeyPair } from './identity.ts';
import { concatBytes, toBytes } from '@noble/hashes/utils';

const NANOSECONDS_TO_MSECS = 1_000_000;

export enum MockReplicaSpyType {
  CallV3 = 'CallV3',
  ReadStateV3 = 'ReadStateV3',
  QueryV3 = 'QueryV3',
}

export type MockReplicaRequest = Request<{ canisterId: string }, Uint8Array, Uint8Array>;
export type MockReplicaResponse = Response<Uint8Array | string>;

export type MockReplicaSpyImpl = (req: MockReplicaRequest, res: MockReplicaResponse) => void;
export type MockReplicaSpy = Mock<MockReplicaSpyImpl>;

export interface MockReplicaSpies {
  [MockReplicaSpyType.CallV3]?: MockReplicaSpy;
  [MockReplicaSpyType.ReadStateV3]?: MockReplicaSpy;
  [MockReplicaSpyType.QueryV3]?: MockReplicaSpy;
}

function fallbackSpyImpl(spyType: MockReplicaSpyType, canisterId: string): MockReplicaSpyImpl {
  return (req, res) => {
    res
      .status(500)
      .send(
        `No implementation defined for ${spyType} spy on canisterId: ${canisterId}. Requested path: ${req.path}`,
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
      '/api/v3/canister/:canisterId/call',
      this.#createEndpointSpy(MockReplicaSpyType.CallV3),
    );
    app.post(
      '/api/v3/canister/:canisterId/read_state',
      this.#createEndpointSpy(MockReplicaSpyType.ReadStateV3),
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

  public setV3CallSpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.CallV3, impl);
  }

  public setV3ReadStateSpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.ReadStateV3, impl);
  }

  public setV3QuerySpyImplOnce(canisterId: string, impl: MockReplicaSpyImpl): void {
    this.#setSpyImplOnce(canisterId, MockReplicaSpyType.QueryV3, impl);
  }

  public getV3CallSpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.CallV3);
  }

  public getV3ReadStateSpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.ReadStateV3);
  }

  public getV3QuerySpy(canisterId: string): MockReplicaSpy {
    return this.#getSpy(canisterId, MockReplicaSpyType.QueryV3);
  }

  public getV3CallReq(canisterId: string, callNumber: number): Signed<CallRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.CallV3);

    return Cbor.decode<Signed<CallRequest>>(req.body);
  }

  public getV3ReadStateReq(canisterId: string, callNumber: number): UnSigned<ReadStateRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.ReadStateV3);

    return Cbor.decode<UnSigned<ReadStateRequest>>(req.body);
  }

  public getV3QueryReq(canisterId: string, callNumber: number): UnSigned<QueryRequest> {
    const [req] = this.#getCallParams(canisterId, callNumber, MockReplicaSpyType.QueryV3);

    return Cbor.decode<UnSigned<QueryRequest>>(req.body);
  }

  #createEndpointSpy(spyType: MockReplicaSpyType): MockReplicaSpyImpl {
    return (req, res) => {
      const { canisterId } = req.params;

      const canisterSpies = this.#listeners.get(canisterId);
      if (!canisterSpies) {
        res.status(500).send(`No listeners defined for canisterId: ${canisterId}.`);
        return;
      }

      const spy = canisterSpies[spyType];
      if (!spy) {
        res.status(500).send(`No ${spyType} spy defined for canisterId: ${canisterId}.`);
        return;
      }

      // add fallback implementation to return 500 if the spy runs out of implementations
      spy.mockImplementation(fallbackSpyImpl(spyType, canisterId));

      spy(req, res);
    };
  }

  #setSpyImplOnce(canisterId: string, spyType: MockReplicaSpyType, impl: MockReplicaSpyImpl): void {
    const map: MockReplicaSpies = this.#listeners.get(canisterId.toString()) ?? {};
    const spy = map[spyType] ?? vi.fn();

    spy.mockImplementationOnce(impl);

    map[spyType] = spy;
    this.#listeners.set(canisterId.toString(), map);
  }

  #getSpy(canisterId: string, spyType: MockReplicaSpyType): MockReplicaSpy {
    const canisterSpies = this.#listeners.get(canisterId);
    if (!canisterSpies) {
      throw new Error(`No listeners defined for canisterId: ${canisterId}.`);
    }

    const spy = canisterSpies[spyType];
    if (!spy) {
      throw new Error(`No ${spyType} spy defined for canisterId: ${canisterId}.`);
    }

    return spy;
  }

  #getCallParams(
    canisterId: string,
    callNumber: number,
    spyType: MockReplicaSpyType,
  ): [MockReplicaRequest, MockReplicaResponse] {
    const spy = this.#getSpy(canisterId, spyType);
    if (!spy.mock.calls.length) {
      throw new Error(`No calls found for canisterId: ${canisterId}.`);
    }

    const callParams = spy.mock.calls[callNumber];
    if (!callParams) {
      throw new Error(
        `No call params found for canisterId: ${canisterId}, callNumber: ${callNumber}. Actual number of calls is ${spy.mock.calls.length}.`,
      );
    }
    if (!callParams[0]) {
      throw new Error(`No request found for canisterId: ${canisterId}, callNumber: ${callNumber}.`);
    }
    if (!callParams[1]) {
      throw new Error(
        `No response found for canisterId: ${canisterId}, callNumber: ${callNumber}.`,
      );
    }

    return callParams;
  }
}

interface V3ResponseOptions {
  canisterId: Principal | string;
  methodName: string;
  arg: Uint8Array;
  sender: Principal | string;
  ingressExpiryInMinutes?: number;
  timeDiffMsecs?: number;
  reply?: string | Uint8Array;
  keyPair?: KeyPair;
  date?: Date;
  nonce?: Nonce;
}

interface V3Response {
  responseBody: Uint8Array;
  requestId: RequestId;
}

/**
 * Prepares a version 3 response for a canister call.
 * @param {V3ResponseOptions} options - The options for preparing the response.
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
 * @returns {Promise<V3Response>} A promise that resolves to the prepared response.
 */
export async function prepareV3Response({
  canisterId,
  methodName,
  arg,
  sender,
  ingressExpiryInMinutes,
  timeDiffMsecs,
  reply,
  keyPair,
  date,
  nonce,
}: V3ResponseOptions): Promise<V3Response> {
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

  const cert: Cert = {
    tree,
    signature,
  };
  const responseBody: v3ResponseBody = {
    certificate: Cbor.encode(cert),
  };

  return {
    responseBody: Cbor.encode(responseBody),
    requestId,
  };
}

export interface V3ReadStateTimeOptions {
  keyPair?: KeyPair;
  date?: Date;
}

export interface V3ReadStateResponse {
  responseBody: Uint8Array;
}

/**
 * Prepares a version 2 read state time response.
 * @param {V3ReadStateTimeOptions} options - The options for preparing the response.
 * @param {Date} options.date - The date for the response.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @returns {Promise<V3ReadStateResponse>} A promise that resolves to the prepared response.
 */
export async function prepareV3ReadStateTimeResponse({
  date,
  keyPair,
}: V3ReadStateTimeOptions): Promise<V3ReadStateResponse> {
  keyPair = keyPair ?? randomKeyPair();
  date = date ?? new Date();

  const tree = createTimeTree(date);
  const signature = await signTree(tree, keyPair);

  const cert: Cert = {
    tree,
    signature,
  };
  const responseBody: ReadStateResponse = {
    certificate: Cbor.encode(cert),
  };

  return {
    responseBody: Cbor.encode(responseBody),
  };
}

interface V3ReadStateSubnetOptions {
  nodeIdentity: Ed25519KeyIdentity;
  canisterRanges: Array<[Uint8Array, Uint8Array]>;
  keyPair?: KeyPair;
  date?: Date;
}

/**
 * Prepares a version 2 read state subnet response.
 * @param {V3ReadStateSubnetOptions} options - The options for preparing the response.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {Array<[Uint8Array, Uint8Array]>} options.canisterRanges - The canister ranges for the subnet.
 * @param {KeyPair} options.keyPair - The key pair for signing.
 * @param {Date} options.date - The date for the response.
 * @returns {Promise<V3ReadStateResponse>} A promise that resolves to the prepared response.
 */
export async function prepareV3ReadStateSubnetResponse({
  nodeIdentity,
  canisterRanges,
  keyPair,
  date,
}: V3ReadStateSubnetOptions): Promise<V3ReadStateResponse> {
  keyPair = keyPair ?? randomKeyPair();
  date = date ?? new Date();

  const subnetId = Principal.selfAuthenticating(keyPair.publicKeyDer).toUint8Array();

  const tree = createSubnetTree({
    subnetId,
    nodeIdentity,
    canisterRanges,
    date,
  });
  const signature = await signTree(tree, keyPair);

  const cert: Cert = {
    tree,
    signature,
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
  const msg = concatBytes(domain_sep('ic-state-root'), rootHash);
  return signBls(msg, keyPair.privateKey);
}

type MockSyncTimeResponseOptions = {
  mockReplica: MockReplica;
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
  keyPair,
  date,
  canisterId,
}: MockSyncTimeResponseOptions) {
  canisterId = Principal.from(canisterId).toText();
  const { responseBody: timeResponseBody } = await prepareV3ReadStateTimeResponse({
    keyPair,
    date,
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterId, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterId, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
  mockReplica.setV3ReadStateSpyImplOnce(canisterId, (_req, res) => {
    res.status(200).send(timeResponseBody);
  });
}
