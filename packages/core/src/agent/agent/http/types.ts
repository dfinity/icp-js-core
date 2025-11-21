import type { Principal } from '#principal';
import { Expiry } from './transforms.ts';
import { randomNumber } from '../../utils/random.ts';

/**
 * @internal
 */
export enum Endpoint {
  Query = 'read',
  ReadState = 'read_state',
  Call = 'call',
}

// An HttpAgent request, before it gets encoded and sent to the server.
// We create an empty request that we will fill later.
export type HttpAgentRequest =
  | HttpAgentQueryRequest
  | HttpAgentSubmitRequest
  | HttpAgentReadStateRequest;

export interface HttpAgentBaseRequest {
  readonly endpoint: Endpoint;
  request: RequestInit;
}

export type HttpHeaderField = [string, string];

export interface HttpAgentSubmitRequest extends HttpAgentBaseRequest {
  readonly endpoint: Endpoint.Call;
  body: CallRequest;
}

export interface HttpAgentQueryRequest extends HttpAgentBaseRequest {
  readonly endpoint: Endpoint.Query;
  body: ReadRequest;
}

export interface HttpAgentReadStateRequest extends HttpAgentBaseRequest {
  readonly endpoint: Endpoint.ReadState;
  body: ReadRequest;
}

export interface Signed<T> {
  content: T;
  sender_pubkey: ArrayBuffer;
  sender_sig: ArrayBuffer;
}

export interface UnSigned<T> {
  content: T;
}

export type Envelope<T> = Signed<T> | UnSigned<T>;

export interface HttpAgentRequestTransformFn {
  (args: HttpAgentRequest): Promise<HttpAgentRequest | undefined | void>;
  priority?: number;
}

// The fields in a "call" submit request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CallRequest extends Record<string, any> {
  request_type: SubmitRequestType.Call;
  canister_id: Principal;
  method_name: string;
  arg: Uint8Array;
  sender: Uint8Array | Principal;
  ingress_expiry: Expiry;
  nonce?: Nonce;
}

// The types of values allowed in the `request_type` field for submit requests.
export enum SubmitRequestType {
  Call = 'call',
}

// The types of values allowed in the `request_type` field for read requests.
export enum ReadRequestType {
  Query = 'query',
  ReadState = 'read_state',
}

// The fields in a "query" read request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryRequest extends Record<string, any> {
  request_type: ReadRequestType.Query;
  canister_id: Principal;
  method_name: string;
  arg: Uint8Array;
  sender: Uint8Array | Principal;
  ingress_expiry: Expiry;
  nonce?: Nonce;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ReadStateRequest extends Record<string, any> {
  request_type: ReadRequestType.ReadState;
  paths: Uint8Array[][];
  ingress_expiry: Expiry;
  sender: Uint8Array | Principal;
}

export type ReadRequest = QueryRequest | ReadStateRequest;

// A Nonce that can be used for calls.
export type Nonce = Uint8Array & { __nonce__: void };

/**
 * Create a random Nonce, based on random values
 */
export function makeNonce(): Nonce {
  // Encode 128 bits.
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  const rand1 = randomNumber();
  const rand2 = randomNumber();
  const rand3 = randomNumber();
  const rand4 = randomNumber();

  view.setUint32(0, rand1);
  view.setUint32(4, rand2);
  view.setUint32(8, rand3);
  view.setUint32(12, rand4);

  return Object.assign(new Uint8Array(buffer), { __nonce__: undefined });
}
