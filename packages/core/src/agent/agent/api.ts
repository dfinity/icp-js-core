import { Principal } from '#principal';
import { type RequestId } from '../request_id.ts';
import { type JsonObject } from '#candid';
import { type Identity } from '../auth.ts';
import type { CallRequest, HttpHeaderField, QueryRequest } from './http/types.ts';

/**
 * Codes used by the replica for rejecting a message.
 * See {@link https://sdk.dfinity.org/docs/interface-spec/#reject-codes | the interface spec}.
 */
export enum ReplicaRejectCode {
  SysFatal = 1,
  SysTransient = 2,
  DestinationInvalid = 3,
  CanisterReject = 4,
  CanisterError = 5,
}

/**
 * Options when doing a {@link Agent.readState} call.
 */
export interface ReadStateOptions {
  /**
   * A list of paths to read the state of.
   */
  paths: Uint8Array[][];
}

/**
 *
 */
export type QueryResponse = QueryResponseReplied | QueryResponseRejected;

export enum QueryResponseStatus {
  Replied = 'replied',
  Rejected = 'rejected',
}

export interface HttpDetailsResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: HttpHeaderField[];
}

export type ApiQueryResponse = QueryResponse & {
  httpDetails: HttpDetailsResponse;
  requestId: RequestId;
};

export interface QueryResponseBase {
  status: QueryResponseStatus;
  requestDetails?: QueryRequest;
}

export type NodeSignature = {
  // the batch time
  timestamp: bigint;
  // the signature
  signature: Uint8Array;
  // the ID of the node that created the signature
  identity: Uint8Array;
};

export interface QueryResponseReplied extends QueryResponseBase {
  status: QueryResponseStatus.Replied;
  reply: { arg: Uint8Array };
  signatures?: NodeSignature[];
}

export interface QueryResponseRejected extends QueryResponseBase {
  status: QueryResponseStatus.Rejected;
  reject_code: ReplicaRejectCode;
  reject_message: string;
  error_code: string;
  signatures?: NodeSignature[];
}

/**
 * Options when doing a {@link Agent.query} call.
 */
export interface QueryFields {
  /**
   * The method name to call.
   */
  methodName: string;

  /**
   * A binary encoded argument. This is already encoded and will be sent as is.
   */
  arg: Uint8Array;

  /**
   * Overrides canister id for path to fetch. This is used for management canister calls.
   */
  effectiveCanisterId?: Principal;
}

/**
 * Options when doing a {@link Agent.call} call.
 */
export interface CallOptions {
  /**
   * The method name to call.
   */
  methodName: string;

  /**
   * A binary encoded argument. This is already encoded and will be sent as is.
   */
  arg: Uint8Array;

  /**
   * An effective canister ID, used for routing. Usually the canister ID, except for management canister calls.
   * @see https://internetcomputer.org/docs/current/references/ic-interface-spec/#http-effective-canister-id
   */
  effectiveCanisterId: Principal | string;
}

export interface ReadStateResponse {
  certificate: Uint8Array;
}

export interface v2ResponseBody {
  error_code?: string;
  reject_code: number;
  reject_message: string;
}

/**
 * Utility function to check if a body is a v2ResponseBody for type safety.
 * @param body The body to check
 * @returns boolean indicating if the body is a v2ResponseBody
 */
export function isV2ResponseBody(
  body: v2ResponseBody | v4ResponseBody | null,
): body is v2ResponseBody {
  return body !== null && body !== undefined && 'reject_code' in body;
}

export interface v4ResponseBody {
  certificate: Uint8Array;
}

/**
 * Utility function to check if a body is a v4ResponseBody for type safety.
 * @param body The body to check
 * @returns boolean indicating if the body is a v4ResponseBody
 */
export function isV4ResponseBody(
  body: v2ResponseBody | v4ResponseBody | null,
): body is v4ResponseBody {
  return body !== null && body !== undefined && 'certificate' in body;
}

export interface SubmitResponse {
  requestId: RequestId;
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    body: v2ResponseBody | v4ResponseBody | null;
    headers: HttpHeaderField[];
  };
  requestDetails?: CallRequest;
}

/**
 * An Agent able to make calls and queries to a Replica.
 */
export interface Agent {
  readonly rootKey: Uint8Array | null;
  /**
   * Returns the principal ID associated with this agent (by default). It only shows
   * the principal of the default identity in the agent, which is the principal used
   * when calls don't specify it.
   */
  getPrincipal(): Promise<Principal>;

  /**
   * Create the request for the read state call.
   * `readState` uses this internally.
   * Useful to avoid signing the same request multiple times.
   */
  createReadStateRequest?(options: ReadStateOptions, identity?: Identity): Promise<unknown>;

  /**
   * Send a read state query to the replica. This includes a list of paths to return,
   * and will return a Certificate. This will only reject on communication errors,
   * but the certificate might contain less information than requested.
   * @param effectiveCanisterId A Canister ID related to this call.
   * @param options The options for this call.
   * @param identity Identity for the call. If not specified, uses the instance identity.
   * @param request The request to send in case it has already been created.
   */
  readState(
    effectiveCanisterId: Principal | string,
    options: ReadStateOptions,
    identity?: Identity,
    request?: unknown,
  ): Promise<ReadStateResponse>;

  call(canisterId: Principal | string, fields: CallOptions): Promise<SubmitResponse>;

  /**
   * Query the status endpoint of the replica. This normally has a few fields that
   * corresponds to the version of the replica, its root public key, and any other
   * information made public.
   * @returns A JsonObject that is essentially a record of fields from the status
   *     endpoint.
   */
  status(): Promise<JsonObject>;

  /**
   * Send a query call to a canister. See
   * {@link https://sdk.dfinity.org/docs/interface-spec/#http-query | the interface spec}.
   * @param canisterId The Principal of the Canister to send the query to. Sending a query to
   *     the management canister is not supported (as it has no meaning from an agent).
   * @param options Options to use to create and send the query.
   * @param identity Sender principal to use when sending the query.
   * @returns The response from the replica. The Promise will only reject when the communication
   *     failed. If the query itself failed but no protocol errors happened, the response will
   *     be of type QueryResponseRejected.
   */
  query(
    canisterId: Principal | string,
    options: QueryFields,
    identity?: Identity | Promise<Identity>,
  ): Promise<ApiQueryResponse>;

  /**
   * By default, the agent is configured to talk to the main Internet Computer,
   * and verifies responses using a hard-coded public key.
   *
   * This function will instruct the agent to ask the endpoint for its public
   * key, and use that instead. This is required when talking to a local test
   * instance, for example.
   *
   * Only use this when you are  _not_ talking to the main Internet Computer,
   * otherwise you are prone to man-in-the-middle attacks! Do not call this
   * function by default.
   */
  fetchRootKey(): Promise<Uint8Array>;
  /**
   * If an application needs to invalidate an identity under certain conditions, an `Agent` may expose an `invalidateIdentity` method.
   * Invoking this method will set the inner identity used by the `Agent` to `null`.
   *
   * A use case for this would be - after a certain period of inactivity, a secure application chooses to invalidate the identity of any `HttpAgent` instances. An invalid identity can be replaced by `Agent.replaceIdentity`
   */
  invalidateIdentity?(): void;
  /**
   * If an application needs to replace an identity under certain conditions, an `Agent` may expose a `replaceIdentity` method.
   * Invoking this method will set the inner identity used by the `Agent` to a newly provided identity.
   *
   * A use case for this would be - after authenticating using `@icp-sdk/auth/client`, you can replace the `AnonymousIdentity` of your `Actor` with a `DelegationIdentity`.
   *
   * ```ts
   * Actor.agentOf(defaultActor).replaceIdentity(await authClient.getIdentity());
   * ```
   */
  replaceIdentity?(identity: Identity): void;
}
