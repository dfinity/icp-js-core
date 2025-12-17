import { type JsonObject } from '#candid';
import { Principal } from '#principal';
import {
  HashTreeDecodeErrorCode,
  CreateHttpAgentErrorCode,
  ExternalError,
  HttpDefaultFetchErrorCode,
  IdentityInvalidErrorCode,
  IngressExpiryInvalidErrorCode,
  InputError,
  LookupErrorCode,
  MalformedPublicKeyErrorCode,
  MalformedSignatureErrorCode,
  MissingRootKeyErrorCode,
  MissingSignatureErrorCode,
  ProtocolError,
  QuerySignatureVerificationFailedErrorCode,
  TimeoutWaitingForResponseErrorCode,
  TrustError,
  UnexpectedErrorCode,
  UnknownError,
  HttpErrorCode,
  HttpV4ApiNotSupportedErrorCode,
  TransportError,
  HttpFetchErrorCode,
  AgentError,
  MalformedLookupFoundValueErrorCode,
  CertificateOutdatedErrorCode,
  CertificateNotAuthorizedErrorCode,
  UNREACHABLE_ERROR,
} from '../../errors.ts';
import { AnonymousIdentity, type Identity } from '../../auth.ts';
import * as cbor from '../../cbor.ts';
import { type RequestId, hashOfMap, requestIdOf } from '../../request_id.ts';
import {
  QueryResponseStatus,
  type Agent,
  type ApiQueryResponse,
  type QueryFields,
  type QueryResponse,
  type ReadStateOptions,
  type ReadStateResponse,
  type SubmitResponse,
} from '../api.ts';
import { Expiry, httpHeadersTransform, makeNonceTransform } from './transforms.ts';
import {
  type CallRequest,
  Endpoint,
  type HttpAgentRequest,
  type HttpAgentRequestTransformFn,
  type HttpAgentSubmitRequest,
  makeNonce,
  type Nonce,
  type QueryRequest,
  ReadRequestType,
  SubmitRequestType,
  type ReadStateRequest,
  type HttpHeaderField,
} from './types.ts';
import { request as canisterStatusRequest } from '../../canisterStatus/index.ts';
import { request as subnetStatusRequest } from '../../subnetStatus/index.ts';
import { lookupNodeKeysFromCertificate, type SubnetNodeKeys } from '../../utils/readState.ts';
import {
  Certificate,
  check_canister_ranges,
  getSubnetIdFromCertificate,
  type HashTree,
  lookup_path,
  LookupPathStatus,
} from '../../certificate.ts';
import { ed25519 } from '@noble/curves/ed25519';
import { ExpirableMap } from '../../utils/expirableMap.ts';
import { Ed25519PublicKey } from '../../public_key.ts';
import { ObservableLog } from '../../observable.ts';
import {
  type BackoffStrategy,
  type BackoffStrategyFactory,
  ExponentialBackoff,
} from '../../polling/backoff.ts';
import { decodeTime } from '../../utils/leb.ts';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { uint8Equals, uint8FromBufLike } from '../../utils/buffer.ts';
import { IC_RESPONSE_DOMAIN_SEPARATOR } from '../../constants.ts';

export enum RequestStatusResponseStatus {
  Received = 'received',
  Processing = 'processing',
  Replied = 'replied',
  Rejected = 'rejected',
  Unknown = 'unknown',
  Done = 'done',
}

const MINUTE_TO_MSECS = 60 * 1_000;
const MSECS_TO_NANOSECONDS = 1_000_000;

const DEFAULT_TIME_DIFF_MSECS = 0;

// Root public key for the IC, encoded as hex
export const IC_ROOT_KEY =
  '308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100814' +
  'c0e6ec71fab583b08bd81373c255c3c371b2e84863c98a4f1e08b74235d14fb5d9c0cd546d968' +
  '5f913a0c0b2cc5341583bf4b4392e467db96d65b9bb4cb717112f8472e0d5a4d14505ffd7484' +
  'b01291091c5f87b98883463f98091a0baaae';

export const MANAGEMENT_CANISTER_ID = 'aaaaa-aa';

// IC0 domain info
const IC0_DOMAIN = 'ic0.app';
const IC0_SUB_DOMAIN = '.ic0.app';

const ICP0_DOMAIN = 'icp0.io';
const ICP0_SUB_DOMAIN = '.icp0.io';

const ICP_API_DOMAIN = 'icp-api.io';
const ICP_API_SUB_DOMAIN = '.icp-api.io';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_ACCEPTED = 202;
const HTTP_STATUS_NOT_FOUND = 404;

// HttpAgent options that can be used at construction.
export interface HttpAgentOptions {
  // A surrogate to the global fetch function. Useful for testing.
  fetch?: typeof fetch;

  // Additional options to pass along to fetch. Will not override fields that
  // the agent already needs to set
  // Should follow the RequestInit interface, but we intentially support non-standard fields
  fetchOptions?: Record<string, unknown>;

  // Additional options to pass along to fetch for the call API.
  callOptions?: Record<string, unknown>;

  // The host to use for the client. By default, uses the same host as
  // the current page.
  host?: string;

  // The principal used to send messages. This cannot be empty at the request
  // time (will throw).
  identity?: Identity | Promise<Identity>;

  /**
   * The maximum time a request can be delayed before being rejected.
   * @default 5 minutes
   */
  ingressExpiryInMinutes?: number;

  credentials?: {
    name: string;
    password?: string;
  };
  /**
   * Adds a unique {@link Nonce} with each query.
   * Enabling will prevent queries from being answered with a cached response.
   * @example
   * const agent = new HttpAgent({ useQueryNonces: true });
   * agent.addTransform(makeNonceTransform(makeNonce);
   * @default false
   */
  useQueryNonces?: boolean;
  /**
   * Number of times to retry requests before throwing an error
   * @default 3
   */
  retryTimes?: number;
  /**
   * The strategy to use for backoff when retrying requests
   */
  backoffStrategy?: BackoffStrategyFactory;
  /**
   * Whether the agent should verify signatures signed by node keys on query responses. Increases security, but adds overhead and must make a separate request to cache the node keys for the canister's subnet.
   * @default true
   */
  verifyQuerySignatures?: boolean;
  /**
   * Whether to log to the console. Defaults to false.
   */
  logToConsole?: boolean;

  /**
   * Alternate root key to use for verifying certificates. If not provided, the default IC root key will be used.
   */
  rootKey?: Uint8Array;

  /**
   * Whether or not the root key should be automatically fetched during construction. Defaults to false.
   */
  shouldFetchRootKey?: boolean;

  /**
   * Whether or not to sync the time with the network during construction. Defaults to false.
   */
  shouldSyncTime?: boolean;
}

function getDefaultFetch(): typeof fetch {
  let defaultFetch;

  if (typeof window !== 'undefined') {
    // Browser context
    if (window.fetch) {
      defaultFetch = window.fetch.bind(window);
    } else {
      throw ExternalError.fromCode(
        new HttpDefaultFetchErrorCode(
          'Fetch implementation was not available. You appear to be in a browser context, but window.fetch was not present.',
        ),
      );
    }
  } else if (typeof global !== 'undefined') {
    // Node context
    if (global.fetch) {
      defaultFetch = global.fetch.bind(global);
    } else {
      throw ExternalError.fromCode(
        new HttpDefaultFetchErrorCode(
          'Fetch implementation was not available. You appear to be in a Node.js context, but global.fetch was not available.',
        ),
      );
    }
  } else if (typeof self !== 'undefined') {
    if (self.fetch) {
      defaultFetch = self.fetch.bind(self);
    }
  }

  if (defaultFetch) {
    return defaultFetch;
  }
  throw ExternalError.fromCode(
    new HttpDefaultFetchErrorCode(
      'Fetch implementation was not available. Please provide fetch to the HttpAgent constructor, or ensure it is available in the window or global context.',
    ),
  );
}

function determineHost(configuredHost: string | undefined): string {
  let host: URL;
  if (configuredHost !== undefined) {
    if (!configuredHost.match(/^[a-z]+:/) && typeof window !== 'undefined') {
      host = new URL(window.location.protocol + '//' + configuredHost);
    } else {
      host = new URL(configuredHost);
    }
  } else {
    // Mainnet, local, and remote environments will have the api route available
    const knownHosts = ['ic0.app', 'icp0.io', '127.0.0.1', 'localhost'];
    const remoteHosts = ['.github.dev', '.gitpod.io'];
    const location = typeof window !== 'undefined' ? window.location : undefined;
    const hostname = location?.hostname;
    let knownHost;
    if (hostname && typeof hostname === 'string') {
      if (remoteHosts.some(host => hostname.endsWith(host))) {
        knownHost = hostname;
      } else {
        knownHost = knownHosts.find(host => hostname.endsWith(host));
      }
    }

    if (location && knownHost) {
      // If the user is on a boundary-node provided host, we can use the same host for the agent
      host = new URL(
        `${location.protocol}//${knownHost}${location.port ? ':' + location.port : ''}`,
      );
    } else {
      host = new URL('https://icp-api.io');
    }
  }
  return host.toString();
}

interface V1HttpAgentInterface {
  _identity: Promise<Identity> | null;
  readonly _fetch: typeof fetch;
  readonly _fetchOptions?: Record<string, unknown>;
  readonly _callOptions?: Record<string, unknown>;

  readonly _host: URL;
  readonly _credentials: string | undefined;
  readonly _retryTimes: number; // Retry requests N times before erroring by default
  _isAgent: true;
}

/** 
 * A HTTP agent allows users to interact with a client of the internet computer
using the available methods. It exposes an API that closely follows the
public view of the internet computer, and is not intended to be exposed
directly to the majority of users due to its low-level interface.
 * There is a pipeline to apply transformations to the request before sending
it to the client. This is to decouple signature, nonce generation and
other computations so that this class can stay as simple as possible while
allowing extensions.
 */
export class HttpAgent implements Agent {
  public rootKey: Uint8Array | null;
  #rootKeyPromise: Promise<Uint8Array> | null = null;
  readonly #shouldFetchRootKey: boolean = false;

  #timeDiffMsecs = DEFAULT_TIME_DIFF_MSECS;
  #hasSyncedTime = false;
  #syncTimePromise: Promise<void> | null = null;
  readonly #shouldSyncTime: boolean = false;

  #identity: Promise<Identity> | null;
  readonly #fetch: typeof fetch;
  readonly #fetchOptions?: Record<string, unknown>;
  readonly #callOptions?: Record<string, unknown>;
  readonly host: URL;
  readonly #credentials: string | undefined;
  readonly #retryTimes; // Retry requests N times before erroring by default
  #backoffStrategy: BackoffStrategyFactory;
  readonly #maxIngressExpiryInMinutes: number;
  get #maxIngressExpiryInMs(): number {
    return this.#maxIngressExpiryInMinutes * MINUTE_TO_MSECS;
  }

  // Public signature to help with type checking.
  public readonly _isAgent = true;
  public config: HttpAgentOptions = {};

  public log: ObservableLog = new ObservableLog();

  #queryPipeline: HttpAgentRequestTransformFn[] = [];
  #updatePipeline: HttpAgentRequestTransformFn[] = [];

  #subnetKeys: ExpirableMap<string, SubnetNodeKeys> = new ExpirableMap({
    expirationTime: 5 * MINUTE_TO_MSECS,
  });
  #verifyQuerySignatures = true;

  /**
   * @param options - Options for the HttpAgent
   * @deprecated Use `HttpAgent.create` or `HttpAgent.createSync` instead
   */
  constructor(options: HttpAgentOptions = {}) {
    this.config = options;
    this.#fetch = options.fetch || getDefaultFetch() || fetch.bind(global);
    this.#fetchOptions = options.fetchOptions;
    this.#callOptions = options.callOptions;
    this.#shouldFetchRootKey = options.shouldFetchRootKey ?? false;
    this.#shouldSyncTime = options.shouldSyncTime ?? false;

    // Use provided root key, otherwise fall back to IC_ROOT_KEY for mainnet or null if the key needs to be fetched
    if (options.rootKey) {
      this.rootKey = options.rootKey;
    } else if (this.#shouldFetchRootKey) {
      this.rootKey = null;
    } else {
      this.rootKey = hexToBytes(IC_ROOT_KEY);
    }

    const host = determineHost(options.host);
    this.host = new URL(host);

    if (options.verifyQuerySignatures !== undefined) {
      this.#verifyQuerySignatures = options.verifyQuerySignatures;
    }
    // Default is 3
    this.#retryTimes = options.retryTimes ?? 3;
    // Delay strategy for retries. Default is exponential backoff
    const defaultBackoffFactory = () =>
      new ExponentialBackoff({
        maxIterations: this.#retryTimes,
      });
    this.#backoffStrategy = options.backoffStrategy || defaultBackoffFactory;
    // Rewrite to avoid redirects
    if (this.host.hostname.endsWith(IC0_SUB_DOMAIN)) {
      this.host.hostname = IC0_DOMAIN;
    } else if (this.host.hostname.endsWith(ICP0_SUB_DOMAIN)) {
      this.host.hostname = ICP0_DOMAIN;
    } else if (this.host.hostname.endsWith(ICP_API_SUB_DOMAIN)) {
      this.host.hostname = ICP_API_DOMAIN;
    }

    if (options.credentials) {
      const { name, password } = options.credentials;
      this.#credentials = `${name}${password ? ':' + password : ''}`;
    }
    this.#identity = Promise.resolve(options.identity || new AnonymousIdentity());

    if (options.ingressExpiryInMinutes && options.ingressExpiryInMinutes > 5) {
      throw InputError.fromCode(
        new IngressExpiryInvalidErrorCode(
          'The maximum ingress expiry time is 5 minutes.',
          options.ingressExpiryInMinutes,
        ),
      );
    }
    if (options.ingressExpiryInMinutes && options.ingressExpiryInMinutes <= 0) {
      throw InputError.fromCode(
        new IngressExpiryInvalidErrorCode(
          'Ingress expiry time must be greater than 0.',
          options.ingressExpiryInMinutes,
        ),
      );
    }

    this.#maxIngressExpiryInMinutes = options.ingressExpiryInMinutes || 5;

    // Add a nonce transform to ensure calls are unique
    this.addTransform('update', makeNonceTransform(makeNonce));
    if (options.useQueryNonces) {
      this.addTransform('query', makeNonceTransform(makeNonce));
    }
    if (options.logToConsole) {
      this.log.subscribe(log => {
        if (log.level === 'error') {
          console.error(log.message);
        } else if (log.level === 'warn') {
          console.warn(log.message);
        } else {
          console.log(log.message);
        }
      });
    }
  }

  public static createSync(options: HttpAgentOptions = {}): HttpAgent {
    return new this({ ...options });
  }

  public static async create(options: HttpAgentOptions = {}): Promise<HttpAgent> {
    const agent = HttpAgent.createSync(options);
    await agent.#asyncGuard();
    return agent;
  }

  public static async from(
    agent: Pick<HttpAgent, 'config'> | V1HttpAgentInterface,
  ): Promise<HttpAgent> {
    try {
      if ('config' in agent) {
        return await HttpAgent.create(agent.config);
      }
      return await HttpAgent.create({
        fetch: agent._fetch,
        fetchOptions: agent._fetchOptions,
        callOptions: agent._callOptions,
        host: agent._host.toString(),
        identity: agent._identity ?? undefined,
      });
    } catch {
      throw InputError.fromCode(new CreateHttpAgentErrorCode());
    }
  }

  public isLocal(): boolean {
    const hostname = this.host.hostname;
    return hostname === '127.0.0.1' || hostname.endsWith('127.0.0.1');
  }

  public addTransform(
    type: 'update' | 'query',
    fn: HttpAgentRequestTransformFn,
    priority = fn.priority || 0,
  ): void {
    if (type === 'update') {
      // Keep the pipeline sorted at all time, by priority.
      const i = this.#updatePipeline.findIndex(x => (x.priority || 0) < priority);
      this.#updatePipeline.splice(
        i >= 0 ? i : this.#updatePipeline.length,
        0,
        Object.assign(fn, { priority }),
      );
    } else if (type === 'query') {
      // Keep the pipeline sorted at all time, by priority.
      const i = this.#queryPipeline.findIndex(x => (x.priority || 0) < priority);
      this.#queryPipeline.splice(
        i >= 0 ? i : this.#queryPipeline.length,
        0,
        Object.assign(fn, { priority }),
      );
    }
  }

  public async getPrincipal(): Promise<Principal> {
    if (!this.#identity) {
      throw ExternalError.fromCode(new IdentityInvalidErrorCode());
    }
    return (await this.#identity).getPrincipal();
  }

  /**
   * Makes a call to a canister method.
   * @param canisterId - The ID of the canister to call. Can be a Principal or a string.
   * @param options - Options for the call.
   * @param options.methodName - The name of the method to call.
   * @param options.arg - The argument to pass to the method, as a Uint8Array.
   * @param options.effectiveCanisterId - (Optional) The effective canister ID, if different from the target canister ID.
   * @param options.callSync - (Optional) Whether to use synchronous call mode. Defaults to true.
   * @param options.nonce - (Optional) A unique nonce for the request. If provided, it will override any nonce set by transforms.
   * @param identity - (Optional) The identity to use for the call. If not provided, the agent's current identity will be used.
   * @returns A promise that resolves to the response of the call, including the request ID and response details.
   */
  public async call(
    canisterId: Principal | string,
    options: {
      methodName: string;
      arg: Uint8Array;
      effectiveCanisterId?: Principal | string;
      callSync?: boolean;
      nonce?: Uint8Array | Nonce;
    },
    identity?: Identity | Promise<Identity>,
  ): Promise<SubmitResponse> {
    const callSync = options.callSync ?? true;
    const id = await (identity ?? this.#identity);
    if (!id) {
      throw ExternalError.fromCode(new IdentityInvalidErrorCode());
    }
    const canister = Principal.from(canisterId);
    const ecid = options.effectiveCanisterId
      ? Principal.from(options.effectiveCanisterId)
      : canister;
    await this.#asyncGuard(ecid);

    const sender = id.getPrincipal();

    const ingress_expiry = calculateIngressExpiry(
      this.#maxIngressExpiryInMinutes,
      this.#timeDiffMsecs,
    );

    const submit: CallRequest = {
      request_type: SubmitRequestType.Call,
      canister_id: canister,
      method_name: options.methodName,
      arg: options.arg,
      sender,
      ingress_expiry,
    };

    let transformedRequest = (await this._transform({
      request: {
        body: null,
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor',
          ...(this.#credentials ? { Authorization: 'Basic ' + btoa(this.#credentials) } : {}),
        },
      },
      endpoint: Endpoint.Call,
      body: submit,
    })) as HttpAgentSubmitRequest;

    // Determine the nonce to use for the request
    let nonce: Nonce | undefined;

    // Check if a nonce is provided in the options and convert it to the correct type
    if (options?.nonce) {
      nonce = toNonce(options.nonce);
    }
    // If no nonce is provided in the options, check the transformedRequest body
    else if (transformedRequest.body.nonce) {
      nonce = toNonce(transformedRequest.body.nonce);
    }
    // If no nonce is found, set it to undefined
    else {
      nonce = undefined;
    }

    // Assign the determined nonce to the submit object
    submit.nonce = nonce;

    /**
     * Converts a Uint8Array to a Nonce type.
     * @param buf - The buffer to convert.
     * @returns The buffer as a Nonce.
     */
    function toNonce(buf: Uint8Array): Nonce {
      return Object.assign(buf, { __nonce__: undefined });
    }

    // Apply transform for identity.
    transformedRequest = (await id.transformRequest(transformedRequest)) as HttpAgentSubmitRequest;

    const body = cbor.encode(transformedRequest.body);
    const backoff = this.#backoffStrategy();
    const requestId = requestIdOf(submit);
    try {
      // Attempt v4 sync call
      const requestSync = () => {
        const url = new URL(`/api/v4/canister/${ecid.toText()}/call`, this.host);
        this.log.print(`fetching "${url.pathname}" with request:`, transformedRequest);
        return this.#fetch(url, {
          ...this.#callOptions,
          ...transformedRequest.request,
          body,
        });
      };

      const requestAsync = () => {
        const url = new URL(`/api/v2/canister/${ecid.toText()}/call`, this.host);
        this.log.print(`fetching "${url.pathname}" with request:`, transformedRequest);
        return this.#fetch(url, {
          ...this.#callOptions,
          ...transformedRequest.request,
          body,
        });
      };

      const requestFn = callSync ? requestSync : requestAsync;
      const { responseBodyBytes, ...response } = await this.#requestAndRetry({
        requestFn,
        backoff,
        tries: 0,
      });

      const responseBody = (
        responseBodyBytes.byteLength > 0 ? cbor.decode(responseBodyBytes) : null
      ) as SubmitResponse['response']['body'];

      return {
        requestId,
        response: {
          ...response,
          body: responseBody,
        },
        requestDetails: submit,
      };
    } catch (error) {
      let callError: AgentError;
      if (error instanceof AgentError) {
        // If the error is due to the v4 api not being supported, fall back to v2
        if (error.hasCode(HttpV4ApiNotSupportedErrorCode)) {
          this.log.warn('v4 api not supported. Fall back to v2');
          return this.call(
            canisterId,
            {
              ...options,
              // disable v4 api
              callSync: false,
            },
            identity,
          );
        } else if (error.hasCode(IngressExpiryInvalidErrorCode) && !this.#hasSyncedTime) {
          // if there is an ingress expiry error and the time has not been synced yet,
          // sync time with the network and try again
          await this.syncTime(canister);
          return this.call(canister, options, identity);
        } else {
          // override the error code to include the request details
          error.code.requestContext = {
            requestId,
            senderPubKey: transformedRequest.body.sender_pubkey,
            senderSignature: transformedRequest.body.sender_sig,
            ingressExpiry: transformedRequest.body.content.ingress_expiry,
          };
          callError = error;
        }
      } else {
        callError = UnknownError.fromCode(new UnexpectedErrorCode(error));
      }
      this.log.error(`Error while making call: ${callError.message}`, callError);
      throw callError;
    }
  }

  async #requestAndRetryQuery(args: {
    ecid: Principal;
    transformedRequest: HttpAgentRequest;
    body: Uint8Array;
    requestId: RequestId;
    backoff: BackoffStrategy;
    tries: number;
  }): Promise<ApiQueryResponse> {
    const { ecid, transformedRequest, body, requestId, backoff, tries } = args;

    const delay = tries === 0 ? 0 : backoff.next();

    const url = new URL(`/api/v3/canister/${ecid.toString()}/query`, this.host);

    this.log.print(`fetching "${url.pathname}" with tries:`, {
      tries,
      backoff,
      delay,
    });

    // If delay is null, the backoff strategy is exhausted due to a maximum number of retries, duration, or other reason
    if (delay === null) {
      throw UnknownError.fromCode(
        new TimeoutWaitingForResponseErrorCode(
          `Backoff strategy exhausted after ${tries} attempts.`,
          requestId,
        ),
      );
    }

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let fetchResponse: Response;
    // Make the request and retry if it throws an error
    try {
      this.log.print(`fetching "${url.pathname}" with request:`, transformedRequest);
      fetchResponse = await this.#fetch(url, {
        ...this.#fetchOptions,
        ...transformedRequest.request,
        body,
      });
    } catch (error) {
      if (tries < this.#retryTimes) {
        this.log.warn(
          `Caught exception while attempting to make query:\n` +
            `  ${error}\n` +
            `  Retrying query.`,
        );
        return await this.#requestAndRetryQuery({ ...args, tries: tries + 1 });
      }
      throw TransportError.fromCode(new HttpFetchErrorCode(error));
    }

    const headers = httpHeadersTransform(fetchResponse.headers);

    if (fetchResponse.status !== HTTP_STATUS_OK) {
      const responseText = await fetchResponse.text();

      if (isIngressExpiryInvalidResponse(responseText)) {
        throw InputError.fromCode(
          new IngressExpiryInvalidErrorCode(responseText, this.#maxIngressExpiryInMinutes),
        );
      }

      if (tries < this.#retryTimes) {
        return await this.#requestAndRetryQuery({ ...args, tries: tries + 1 });
      }

      throw ProtocolError.fromCode(
        new HttpErrorCode(fetchResponse.status, fetchResponse.statusText, headers, responseText),
      );
    }

    const queryResponse: QueryResponse = cbor.decode(
      uint8FromBufLike(await fetchResponse.arrayBuffer()),
    );
    const response: ApiQueryResponse = {
      ...queryResponse,
      httpDetails: {
        ok: fetchResponse.ok,
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers,
      },
      requestId,
    };

    // Skip timestamp verification if the user has set verifyQuerySignatures to false
    if (!this.#verifyQuerySignatures) {
      return response;
    }

    const signatureTimestampNs = response.signatures?.[0]?.timestamp;
    if (!signatureTimestampNs) {
      throw ProtocolError.fromCode(
        new MalformedSignatureErrorCode(
          'Timestamp not found in query response. This suggests a malformed or malicious response.',
        ),
      );
    }

    const signatureTimestampMs = Number(
      BigInt(signatureTimestampNs) / BigInt(MSECS_TO_NANOSECONDS),
    );
    const currentTimestampInMs = Date.now() + this.#timeDiffMsecs;

    // We don't need `Math.abs` here because we allow signatures in the future
    if (currentTimestampInMs - signatureTimestampMs > this.#maxIngressExpiryInMs) {
      if (tries < this.#retryTimes) {
        this.log.warn('Timestamp is older than the max ingress expiry. Retrying query.', {
          requestId,
          signatureTimestampMs,
        });
        await this.syncTime(ecid);
        return await this.#requestAndRetryQuery({ ...args, tries: tries + 1 });
      }
      throw TrustError.fromCode(
        new CertificateOutdatedErrorCode(this.#maxIngressExpiryInMinutes, requestId, tries),
      );
    }

    return response;
  }

  /**
   * Makes a request and retries if it fails.
   * @param args - The arguments for the request.
   * @param args.requestFn - A function that returns a Promise resolving to a Response.
   * @param args.backoff - The backoff strategy to use for retries.
   * @param args.tries - The number of retry attempts made so far.
   * @returns The response from the request, if the status is 200 or 202.
   * See the https://internetcomputer.org/docs/references/ic-interface-spec#http-interface for details on the response statuses.
   * @throws {ProtocolError} if the response status is not 200 or 202, and the retry limit has been reached.
   * @throws {TransportError} if the request fails, and the retry limit has been reached.
   */
  async #requestAndRetry(args: {
    requestFn: () => Promise<Response>;
    backoff: BackoffStrategy;
    tries: number;
  }): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    responseBodyBytes: Uint8Array;
    headers: HttpHeaderField[];
  }> {
    const { requestFn, backoff, tries } = args;
    const delay = tries === 0 ? 0 : backoff.next();

    // If delay is null, the backoff strategy is exhausted due to a maximum number of retries, duration, or other reason
    if (delay === null) {
      throw ProtocolError.fromCode(
        new TimeoutWaitingForResponseErrorCode(`Retry strategy exhausted after ${tries} attempts.`),
      );
    }

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let response: Response;
    let responseBodyBytes = new Uint8Array();
    try {
      response = await requestFn();
      // According to the spec, only 200 responses have a non-empty body
      if (response.status === HTTP_STATUS_OK) {
        // Consume the response body, to ensure that the response is not closed unexpectedly
        responseBodyBytes = uint8FromBufLike(await response.clone().arrayBuffer());
      }
    } catch (error) {
      if (tries < this.#retryTimes) {
        this.log.warn(
          `Caught exception while attempting to make request:\n` +
            `  ${error}\n` +
            `  Retrying request.`,
        );
        // Delay the request by the configured backoff strategy
        return await this.#requestAndRetry({ requestFn, backoff, tries: tries + 1 });
      }
      throw TransportError.fromCode(new HttpFetchErrorCode(error));
    }

    const headers = httpHeadersTransform(response.headers);

    if (response.status === HTTP_STATUS_OK || response.status === HTTP_STATUS_ACCEPTED) {
      return {
        ok: response.ok, // should always be true
        status: response.status,
        statusText: response.statusText,
        responseBodyBytes,
        headers,
      };
    }

    const responseText = await response.text();

    if (response.status === HTTP_STATUS_NOT_FOUND && response.url.includes('api/v4')) {
      throw ProtocolError.fromCode(new HttpV4ApiNotSupportedErrorCode());
    }

    if (isIngressExpiryInvalidResponse(responseText)) {
      throw InputError.fromCode(
        new IngressExpiryInvalidErrorCode(responseText, this.#maxIngressExpiryInMinutes),
      );
    }

    if (tries < this.#retryTimes) {
      return await this.#requestAndRetry({ requestFn, backoff, tries: tries + 1 });
    }

    throw ProtocolError.fromCode(
      new HttpErrorCode(response.status, response.statusText, headers, responseText),
    );
  }

  public async query(
    canisterId: Principal | string,
    fields: QueryFields,
    identity?: Identity | Promise<Identity>,
  ): Promise<ApiQueryResponse> {
    const backoff = this.#backoffStrategy();
    const ecid = fields.effectiveCanisterId
      ? Principal.from(fields.effectiveCanisterId)
      : Principal.from(canisterId);
    await this.#asyncGuard(ecid);

    this.log.print(`ecid ${ecid.toString()}`);
    this.log.print(`canisterId ${canisterId.toString()}`);

    let transformedRequest: HttpAgentRequest | undefined;
    const id = await (identity ?? this.#identity);
    if (!id) {
      throw ExternalError.fromCode(new IdentityInvalidErrorCode());
    }

    const canister = Principal.from(canisterId);
    const sender = id.getPrincipal();
    const ingressExpiry = calculateIngressExpiry(
      this.#maxIngressExpiryInMinutes,
      this.#timeDiffMsecs,
    );

    const request: QueryRequest = {
      request_type: ReadRequestType.Query,
      canister_id: canister,
      method_name: fields.methodName,
      arg: fields.arg,
      sender,
      ingress_expiry: ingressExpiry,
    };

    const requestId = requestIdOf(request);

    transformedRequest = await this._transform({
      request: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor',
          ...(this.#credentials ? { Authorization: 'Basic ' + btoa(this.#credentials) } : {}),
        },
      },
      endpoint: Endpoint.Query,
      body: request,
    });

    // Apply transform for identity.
    transformedRequest = (await id.transformRequest(transformedRequest)) as HttpAgentRequest;

    const body = cbor.encode(transformedRequest.body);

    const args = {
      canister: canister.toText(),
      ecid,
      transformedRequest,
      body,
      requestId,
      backoff,
      tries: 0,
    };

    const makeQuery = async () => {
      // Attempt to make the query i=retryTimes times
      const query = await this.#requestAndRetryQuery(args);
      return {
        requestDetails: request,
        ...query,
      };
    };

    const getSubnetNodeKeys = async (): Promise<SubnetNodeKeys> => {
      const cachedSubnetNodeKeys = this.#subnetKeys.get(ecid.toString());
      if (cachedSubnetNodeKeys) {
        return cachedSubnetNodeKeys;
      }
      await this.fetchSubnetKeys(ecid.toString());
      const subnetNodeKeys = this.#subnetKeys.get(ecid.toString());
      if (!subnetNodeKeys) {
        throw TrustError.fromCode(new MissingSignatureErrorCode());
      }
      return subnetNodeKeys;
    };

    try {
      if (!this.#verifyQuerySignatures) {
        // Skip verification if the user has disabled it
        return await makeQuery();
      }

      // Make query and fetch subnet keys in parallel
      const [queryWithDetails, subnetNodeKeys] = await Promise.all([
        makeQuery(),
        getSubnetNodeKeys(),
      ]);

      try {
        return this.#verifyQueryResponse(queryWithDetails, subnetNodeKeys);
      } catch {
        // In case the node signatures have changed, refresh the subnet keys and try again
        this.log.warn('Query response verification failed. Retrying with fresh subnet keys.');
        this.#subnetKeys.delete(ecid.toString());
        const updatedSubnetNodeKeys = await getSubnetNodeKeys();
        return this.#verifyQueryResponse(queryWithDetails, updatedSubnetNodeKeys);
      }
    } catch (error) {
      let queryError: AgentError;
      if (error instanceof AgentError) {
        if (error.hasCode(IngressExpiryInvalidErrorCode) && !this.#hasSyncedTime) {
          // if there is an ingress expiry error and the time has not been synced yet,
          // sync time with the network and try again
          await this.syncTime(ecid);
          return this.query(canisterId, fields, identity);
        }
        // override the error code to include the request details
        error.code.requestContext = {
          requestId,
          senderPubKey: transformedRequest.body.sender_pubkey,
          senderSignature: transformedRequest.body.sender_sig,
          ingressExpiry: transformedRequest.body.content.ingress_expiry,
        };
        queryError = error;
      } else {
        queryError = UnknownError.fromCode(new UnexpectedErrorCode(error));
      }
      this.log.error(`Error while making query: ${queryError.message}`, queryError);
      throw queryError;
    }
  }

  /**
   * See https://internetcomputer.org/docs/current/references/ic-interface-spec/#http-query for details on validation
   * @param queryResponse - The response from the query
   * @param subnetNodeKeys - The subnet node keys
   * @returns ApiQueryResponse
   */
  #verifyQueryResponse = (
    queryResponse: ApiQueryResponse,
    subnetNodeKeys: SubnetNodeKeys,
  ): ApiQueryResponse => {
    if (this.#verifyQuerySignatures === false) {
      // This should not be called if the user has disabled verification
      return queryResponse;
    }
    const { status, signatures = [], requestId } = queryResponse;

    for (const sig of signatures) {
      const { timestamp, identity } = sig;
      const nodeId = Principal.fromUint8Array(identity).toText();

      // Hash is constructed differently depending on the status
      let hash: Uint8Array;
      if (status === QueryResponseStatus.Replied) {
        const { reply } = queryResponse;
        hash = hashOfMap({
          status: status,
          reply: reply,
          timestamp: BigInt(timestamp),
          request_id: requestId,
        });
      } else if (status === QueryResponseStatus.Rejected) {
        const { reject_code, reject_message, error_code } = queryResponse;
        hash = hashOfMap({
          status: status,
          reject_code: reject_code,
          reject_message: reject_message,
          error_code: error_code,
          timestamp: BigInt(timestamp),
          request_id: requestId,
        });
      } else {
        throw UnknownError.fromCode(new UnexpectedErrorCode(`Unknown status: ${status}`));
      }

      const separatorWithHash = concatBytes(IC_RESPONSE_DOMAIN_SEPARATOR, hash);

      const pubKey = subnetNodeKeys.get(nodeId);
      if (!pubKey) {
        throw ProtocolError.fromCode(new MalformedPublicKeyErrorCode());
      }
      const rawKey = Ed25519PublicKey.fromDer(pubKey).rawKey;
      const valid = ed25519.verify(sig.signature, separatorWithHash, rawKey);
      if (!valid) {
        throw TrustError.fromCode(new QuerySignatureVerificationFailedErrorCode(nodeId));
      }
    }
    return queryResponse;
  };

  public async createReadStateRequest(
    fields: ReadStateOptions,
    identity?: Identity | Promise<Identity>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    await this.#asyncGuard();
    const id = await (identity ?? this.#identity);
    if (!id) {
      throw ExternalError.fromCode(new IdentityInvalidErrorCode());
    }
    const sender = id.getPrincipal();

    const transformedRequest = await this._transform({
      request: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor',
          ...(this.#credentials ? { Authorization: 'Basic ' + btoa(this.#credentials) } : {}),
        },
      },
      endpoint: Endpoint.ReadState,
      body: {
        request_type: ReadRequestType.ReadState,
        paths: fields.paths,
        sender,
        ingress_expiry: calculateIngressExpiry(
          this.#maxIngressExpiryInMinutes,
          this.#timeDiffMsecs,
        ),
      },
    });

    // Apply transform for identity.
    return id.transformRequest(transformedRequest);
  }

  public async readState(
    canisterId: Principal | string,
    fields: ReadStateOptions,
    _identity?: Identity | Promise<Identity>,
    // eslint-disable-next-line
    request?: any,
  ): Promise<ReadStateResponse> {
    await this.#rootKeyGuard();
    const canister = Principal.from(canisterId);

    function getRequestId(options: ReadStateOptions): RequestId | undefined {
      for (const path of options.paths) {
        const [pathName, value] = path;
        const request_status = new TextEncoder().encode('request_status');
        if (uint8Equals(pathName, request_status)) {
          return value as RequestId;
        }
      }
    }

    let transformedRequest: ReadStateRequest;
    let requestId: RequestId | undefined;

    // If a pre-signed request is provided, use it
    if (request) {
      // This is a pre-signed request
      transformedRequest = request;
    } else {
      // This is fields, we need to create a request
      requestId = getRequestId(fields);

      // Always create a fresh request with the current identity
      const identity = await this.#identity;
      if (!identity) {
        throw ExternalError.fromCode(new IdentityInvalidErrorCode());
      }
      transformedRequest = await this.createReadStateRequest(fields, identity);
    }

    const url = new URL(`/api/v3/canister/${canister.toString()}/read_state`, this.host);

    return await this.#readStateInner(url, { canisterId: canister }, transformedRequest, requestId);
  }

  /**
   * Reads the state of a subnet from the `/api/v3/subnet/{subnetId}/read_state` endpoint.
   * @param subnetId The ID of the subnet to read the state of. If you have a canister ID, you can use {@link HttpAgent.getSubnetIdFromCanister | getSubnetIdFromCanister} to get the subnet ID.
   * @param options The options for the read state request.
   * @returns The response from the read state request.
   */
  public async readSubnetState(
    subnetId: Principal | string,
    options: ReadStateOptions,
  ): Promise<ReadStateResponse> {
    await this.#rootKeyGuard();
    const subnet = Principal.from(subnetId);

    const url = new URL(`/api/v3/subnet/${subnet.toString()}/read_state`, this.host);
    const transformedRequest: ReadStateRequest = await this.createReadStateRequest(
      options,
      this.#identity ?? undefined,
    );

    return await this.#readStateInner(url, { subnetId: subnet }, transformedRequest);
  }

  async #readStateInner(
    url: URL,
    principal: { canisterId: Principal } | { subnetId: Principal },
    transformedRequest: ReadStateRequest,
    requestId?: RequestId,
  ): Promise<ReadStateResponse> {
    const backoff = this.#backoffStrategy();
    try {
      const { responseBodyBytes } = await this.#requestAndRetry({
        requestFn: () =>
          this.#fetch(url, {
            ...this.#fetchOptions,
            ...transformedRequest.request,
            body: cbor.encode(transformedRequest.body),
          }),
        backoff,
        tries: 0,
      });

      const decodedResponse: ReadStateResponse = cbor.decode(responseBodyBytes);

      return decodedResponse;
    } catch (error) {
      let readStateError: AgentError;
      if (error instanceof AgentError) {
        if (error.hasCode(IngressExpiryInvalidErrorCode) && !this.#hasSyncedTime) {
          // if there is an ingress expiry error and the time has not been synced yet,
          // sync time with the network and try again
          if ('canisterId' in principal) {
            await this.syncTime(principal.canisterId);
          } else if ('subnetId' in principal) {
            await this.syncTimeWithSubnet(principal.subnetId);
          } else {
            throw UNREACHABLE_ERROR;
          }
          return await this.#readStateInner(url, principal, transformedRequest, requestId);
        }
        // override the error code to include the request details
        error.code.requestContext = {
          requestId: requestId ?? requestIdOf(transformedRequest),
          senderPubKey: transformedRequest.body.sender_pubkey,
          senderSignature: transformedRequest.body.sender_sig,
          ingressExpiry: transformedRequest.body.content.ingress_expiry,
        };
        readStateError = error;
      } else {
        readStateError = UnknownError.fromCode(new UnexpectedErrorCode(error));
      }
      this.log.error(`Error while making read state: ${readStateError.message}`, readStateError);
      throw readStateError;
    }
  }

  public parseTimeFromResponse(response: { certificate: Uint8Array }): number {
    let tree: HashTree;
    if (response.certificate) {
      const decoded = cbor.decode<{ tree: HashTree } | undefined>(response.certificate);
      if (decoded && 'tree' in decoded) {
        tree = decoded.tree;
      } else {
        throw ProtocolError.fromCode(
          new HashTreeDecodeErrorCode('Could not decode time from response'),
        );
      }
      const timeLookup = lookup_path(['time'], tree);
      if (timeLookup.status !== LookupPathStatus.Found) {
        throw ProtocolError.fromCode(
          new LookupErrorCode(
            'Time was not found in the response or was not in its expected format.',
            timeLookup.status,
          ),
        );
      }

      if (!(timeLookup.value instanceof Uint8Array) && !ArrayBuffer.isView(timeLookup)) {
        throw ProtocolError.fromCode(
          new MalformedLookupFoundValueErrorCode('Time was not in its expected format.'),
        );
      }
      const date = decodeTime(timeLookup.value);
      this.log.print('Time from response:', date);
      this.log.print('Time from response in milliseconds:', date.getTime());
      return date.getTime();
    } else {
      this.log.warn('No certificate found in response');
    }
    return 0;
  }

  /**
   * Allows agent to sync its time with the network. Can be called during initialization or mid-lifecycle if the device's clock has drifted away from the network time. This is necessary to set the Expiry for a request
   * @param {Principal} canisterIdOverride - Pass a canister ID if you need to sync the time with a particular subnet. Uses the ICP ledger canister by default.
   */
  public async syncTime(canisterIdOverride?: Principal): Promise<void> {
    this.#syncTimePromise =
      this.#syncTimePromise ??
      (async () => {
        await this.#rootKeyGuard();
        const callTime = Date.now();
        try {
          if (!canisterIdOverride) {
            this.log.print(
              'Syncing time with the IC. No canisterId provided, so falling back to ryjl3-tyaaa-aaaaa-aaaba-cai',
            );
          }
          // Fall back with canisterId of the ICP Ledger
          const canisterId = canisterIdOverride ?? Principal.from('ryjl3-tyaaa-aaaaa-aaaba-cai');

          const anonymousAgent = HttpAgent.createSync({
            identity: new AnonymousIdentity(),
            host: this.host.toString(),
            fetch: this.#fetch,
            retryTimes: 0,
            rootKey: this.rootKey ?? undefined,
            shouldSyncTime: false,
          });

          const replicaTimes = await Promise.all(
            Array(3)
              .fill(null)
              .map(async () => {
                const status = await canisterStatusRequest({
                  canisterId,
                  agent: anonymousAgent,
                  paths: ['time'],
                  disableCertificateTimeVerification: true, // avoid recursive calls to syncTime
                });

                const date = status.get('time');
                if (date instanceof Date) {
                  return date.getTime();
                }
              }, []),
          );

          this.#setTimeDiffMsecs(callTime, replicaTimes);
        } catch (error) {
          const syncTimeError =
            error instanceof AgentError
              ? error
              : UnknownError.fromCode(new UnexpectedErrorCode(error));
          this.log.error('Caught exception while attempting to sync time', syncTimeError);

          throw syncTimeError;
        }
      })();

    await this.#syncTimePromise.finally(() => {
      this.#syncTimePromise = null;
    });
  }

  /**
   * Allows agent to sync its time with the network.
   * @param {Principal} subnetId - Pass the subnet ID you need to sync the time with.
   */
  public async syncTimeWithSubnet(subnetId: Principal): Promise<void> {
    await this.#rootKeyGuard();
    const callTime = Date.now();

    try {
      const anonymousAgent = HttpAgent.createSync({
        identity: new AnonymousIdentity(),
        host: this.host.toString(),
        fetch: this.#fetch,
        retryTimes: 0,
        rootKey: this.rootKey ?? undefined,
        shouldSyncTime: false,
      });

      const replicaTimes = await Promise.all(
        Array(3)
          .fill(null)
          .map(async () => {
            const status = await subnetStatusRequest({
              subnetId,
              agent: anonymousAgent,
              paths: ['time'],
              disableCertificateTimeVerification: true, // avoid recursive calls to syncTime
            });

            const date = status.get('time');
            if (date instanceof Date) {
              return date.getTime();
            }
          }, []),
      );

      this.#setTimeDiffMsecs(callTime, replicaTimes);
    } catch (error) {
      const syncTimeError =
        error instanceof AgentError ? error : UnknownError.fromCode(new UnexpectedErrorCode(error));
      this.log.error('Caught exception while attempting to sync time with subnet', syncTimeError);

      throw syncTimeError;
    }
  }

  #setTimeDiffMsecs(callTime: number, replicaTimes: Array<number | undefined>): void {
    const maxReplicaTime = replicaTimes.reduce<number>((max, current) => {
      return typeof current === 'number' && current > max ? current : max;
    }, 0);

    if (maxReplicaTime > 0) {
      this.#timeDiffMsecs = maxReplicaTime - callTime;
      this.#hasSyncedTime = true;
      this.log.notify({
        message: `Syncing time: offset of ${this.#timeDiffMsecs}`,
        level: 'info',
      });
    }
  }

  public async status(): Promise<JsonObject> {
    const headers: Record<string, string> = this.#credentials
      ? {
          Authorization: 'Basic ' + btoa(this.#credentials),
        }
      : {};

    const url = new URL(`/api/v2/status`, this.host);

    this.log.print(`fetching "${url.pathname}"`);
    const backoff = this.#backoffStrategy();
    const { responseBodyBytes } = await this.#requestAndRetry({
      backoff,
      requestFn: () => this.#fetch(url, { headers, ...this.#fetchOptions }),
      tries: 0,
    });
    return cbor.decode(responseBodyBytes);
  }

  public async fetchRootKey(): Promise<Uint8Array> {
    // Wait for already pending promise to avoid duplicate calls
    this.#rootKeyPromise =
      this.#rootKeyPromise ??
      (async () => {
        const value = await this.status();
        // Hex-encoded version of the replica root key
        this.rootKey = (value as JsonObject & { root_key: Uint8Array }).root_key;
        return this.rootKey;
      })();

    // clear rootkey promise and return result
    return await this.#rootKeyPromise.finally(() => {
      this.#rootKeyPromise = null;
    });
  }

  async #asyncGuard(canisterIdOverride?: Principal): Promise<void> {
    await Promise.all([this.#rootKeyGuard(), this.#syncTimeGuard(canisterIdOverride)]);
  }

  async #rootKeyGuard(): Promise<void> {
    if (this.rootKey) {
      return;
    } else if (
      this.rootKey === null &&
      this.host.toString() !== 'https://icp-api.io' &&
      this.#shouldFetchRootKey
    ) {
      await this.fetchRootKey();
    } else {
      throw ExternalError.fromCode(new MissingRootKeyErrorCode(this.#shouldFetchRootKey));
    }
  }

  async #syncTimeGuard(canisterIdOverride?: Principal): Promise<void> {
    if (this.#shouldSyncTime && !this.hasSyncedTime()) {
      await this.syncTime(canisterIdOverride);
    }
  }

  public invalidateIdentity(): void {
    this.#identity = null;
  }

  public replaceIdentity(identity: Identity): void {
    this.#identity = Promise.resolve(identity);
  }

  public async fetchSubnetKeys(canisterId: Principal | string): Promise<SubnetNodeKeys> {
    const effectiveCanisterId: Principal = Principal.from(canisterId);
    await this.#asyncGuard(effectiveCanisterId);

    const rootKey = this.rootKey!;

    const canisterReadState = await this.readState(effectiveCanisterId, {
      paths: [[utf8ToBytes('subnet')]],
    });
    const canisterCertificate = await Certificate.create({
      certificate: canisterReadState.certificate,
      rootKey,
      principal: { canisterId: effectiveCanisterId },
      agent: this,
    });
    if (!canisterCertificate.cert.delegation) {
      const subnetId = Principal.selfAuthenticating(rootKey);
      const canisterInRange = check_canister_ranges({
        canisterId: effectiveCanisterId,
        subnetId,
        tree: canisterCertificate.cert.tree,
      });
      if (!canisterInRange) {
        throw TrustError.fromCode(
          new CertificateNotAuthorizedErrorCode(effectiveCanisterId, subnetId),
        );
      }
    }

    const subnetId = getSubnetIdFromCertificate(canisterCertificate.cert, rootKey);
    const nodeKeys = lookupNodeKeysFromCertificate(canisterCertificate.cert, subnetId);
    this.#subnetKeys.set(effectiveCanisterId.toText(), nodeKeys);

    return nodeKeys;
  }

  /**
   * Returns the subnet ID for a given canister ID, by looking at the certificate delegation
   * returned by the canister's state obtained by requesting the `/time` path with {@link HttpAgent.readState | readState}.
   * @param canisterId The canister ID to get the subnet ID for.
   * @returns The subnet ID for the given canister ID.
   */
  public async getSubnetIdFromCanister(canisterId: Principal | string): Promise<Principal> {
    const effectiveCanisterId = Principal.from(canisterId);
    await this.#asyncGuard(effectiveCanisterId);

    const canisterReadState = await this.readState(effectiveCanisterId, {
      paths: [[utf8ToBytes('time')]],
    });
    const canisterCertificate = await Certificate.create({
      certificate: canisterReadState.certificate,
      rootKey: this.rootKey!,
      principal: { canisterId: effectiveCanisterId },
      agent: this,
    });

    return getSubnetIdFromCertificate(canisterCertificate.cert, this.rootKey!);
  }

  protected _transform(request: HttpAgentRequest): Promise<HttpAgentRequest> {
    let p = Promise.resolve(request);
    if (request.endpoint === Endpoint.Call) {
      for (const fn of this.#updatePipeline) {
        p = p.then(r => fn(r).then(r2 => r2 || r));
      }
    } else {
      for (const fn of this.#queryPipeline) {
        p = p.then(r => fn(r).then(r2 => r2 || r));
      }
    }

    return p;
  }

  /**
   * Returns the time difference in milliseconds between the IC network clock and the client's clock,
   * after the clock has been synced.
   *
   * If the time has not been synced, returns `0`.
   */
  public getTimeDiffMsecs(): number {
    return this.#timeDiffMsecs;
  }

  /**
   * Returns `true` if the time has been synced at least once with the IC network, `false` otherwise.
   */
  public hasSyncedTime(): boolean {
    return this.#hasSyncedTime;
  }
}

/**
 * Calculates the ingress expiry time based on the maximum allowed expiry in minutes and the time difference in milliseconds.
 * The expiry is rounded down according to the {@link Expiry.fromDeltaInMilliseconds} method.
 * @param maxIngressExpiryInMinutes - The maximum ingress expiry time in minutes.
 * @param timeDiffMsecs - The time difference in milliseconds to adjust the expiry.
 * @returns The calculated ingress expiry as an Expiry object.
 */
export function calculateIngressExpiry(
  maxIngressExpiryInMinutes: number,
  timeDiffMsecs: number,
): Expiry {
  const ingressExpiryMs = maxIngressExpiryInMinutes * MINUTE_TO_MSECS;
  return Expiry.fromDeltaInMilliseconds(ingressExpiryMs, timeDiffMsecs);
}

/**
 * Checks if the response text is an ingress expiry invalid response.
 * @see https://github.com/dfinity/ic/blob/23d5990bfc5277c32e54f0087b5a38fa412171e1/rs/validator/src/ingress_validation.rs#L233
 * @param responseText The response body as string.
 * @returns `true` if the response text is an ingress expiry invalid response, `false` otherwise.
 */
function isIngressExpiryInvalidResponse(responseText: string): boolean {
  return responseText.includes('Invalid request expiry: ');
}
