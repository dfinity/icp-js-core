import {
  type Agent,
  type HttpDetailsResponse,
  isV2ResponseBody,
  isV3ResponseBody,
  QueryResponseStatus,
} from './agent/index.ts';
import {
  CertifiedRejectErrorCode,
  ExternalError,
  InputError,
  MissingCanisterIdErrorCode,
  MissingRootKeyErrorCode,
  RejectError,
  UncertifiedRejectErrorCode,
  UncertifiedRejectUpdateErrorCode,
  UnexpectedErrorCode,
  UnknownError,
} from './errors.ts';
import { IDL } from '@dfinity/candid';
import { pollForResponse, type PollingOptions, DEFAULT_POLLING_OPTIONS } from './polling/index.ts';
import { Principal } from '@dfinity/principal';
import { Certificate, type CreateCertificateOptions, lookupResultToBuffer } from './certificate.ts';
import { HttpAgent } from './agent/http/index.ts';
import { utf8ToBytes } from '@noble/hashes/utils';

/**
 * Configuration to make calls to the Replica.
 */
export interface CallConfig {
  /**
   * An agent to use in this call, otherwise the actor or call will try to discover the
   * agent to use.
   */
  agent?: Agent;

  /**
   * Options for controlling polling behavior.
   */
  pollingOptions?: PollingOptions;

  /**
   * The canister ID of this Actor.
   */
  canisterId?: string | Principal;

  /**
   * The effective canister ID.
   */
  effectiveCanisterId?: Principal;

  /**
   * The nonce to use for this call. This is used to prevent replay attacks.
   */
  nonce?: Uint8Array;
}

/**
 * Configuration that can be passed to customize the Actor behavior.
 */
export interface ActorConfig extends Pick<CallConfig, 'agent' | 'effectiveCanisterId'> {
  /**
   * The Canister ID of this Actor. This is required for an Actor.
   */
  canisterId: string | Principal;

  /**
   * An override function for update calls' CallConfig. This will be called on every calls.
   */
  callTransform?(
    methodName: string,
    args: unknown[],
    callConfig: CallConfig,
  ): Partial<CallConfig> | void;

  /**
   * An override function for query calls' CallConfig. This will be called on every query.
   */
  queryTransform?(
    methodName: string,
    args: unknown[],
    callConfig: CallConfig,
  ): Partial<CallConfig> | void;

  /**
   * Polyfill for BLS Certificate verification in case wasm is not supported
   */
  blsVerify?: CreateCertificateOptions['blsVerify'];

  /**
   * Polling options to use when making update calls. This will override the default DEFAULT_POLLING_OPTIONS.
   */
  pollingOptions?: PollingOptions;
}

// TODO: move this to proper typing when Candid support TypeScript.
/**
 * A subclass of an actor. Actor class itself is meant to be a based class.
 */
export type ActorSubclass<T = Record<string, ActorMethod>> = Actor & T;

/**
 * An actor method type, defined for each methods of the actor service.
 */
export interface ActorMethod<Args extends unknown[] = unknown[], Ret = unknown> {
  (...args: Args): Promise<Ret>;

  withOptions(options: CallConfig): (...args: Args) => Promise<Ret>;
}

/**
 * An actor method type, defined for each methods of the actor service.
 */
export interface ActorMethodWithHttpDetails<Args extends unknown[] = unknown[], Ret = unknown>
  extends ActorMethod {
  (...args: Args): Promise<{ httpDetails: HttpDetailsResponse; result: Ret }>;
}

/**
 * An actor method type, defined for each methods of the actor service.
 */
export interface ActorMethodExtended<Args extends unknown[] = unknown[], Ret = unknown>
  extends ActorMethod {
  (...args: Args): Promise<{
    certificate?: Certificate;
    httpDetails?: HttpDetailsResponse;
    result: Ret;
  }>;
}

export type FunctionWithArgsAndReturn<Args extends unknown[] = unknown[], Ret = unknown> = (
  ...args: Args
) => Ret;

// Update all entries of T with the extra information from ActorMethodWithInfo
export type ActorMethodMappedWithHttpDetails<T> = {
  [K in keyof T]: T[K] extends FunctionWithArgsAndReturn<infer Args, infer Ret>
    ? ActorMethodWithHttpDetails<Args, Ret>
    : never;
};

// Update all entries of T with the extra information from ActorMethodWithInfo
export type ActorMethodMappedExtended<T> = {
  [K in keyof T]: T[K] extends FunctionWithArgsAndReturn<infer Args, infer Ret>
    ? ActorMethodExtended<Args, Ret>
    : never;
};

/**
 * Internal metadata for actors. It's an enhanced version of ActorConfig with
 * some fields marked as required (as they are defaulted) and canisterId as
 * a Principal type.
 */
interface ActorMetadata {
  service: IDL.ServiceClass;
  agent?: Agent;
  config: ActorConfig;
}

const metadataSymbol = Symbol.for('ic-agent-metadata');

export interface CreateActorClassOpts {
  httpDetails?: boolean;
  certificate?: boolean;
}

/**
 * An actor base class. An actor is an object containing only functions that will
 * return a promise. These functions are derived from the IDL definition.
 */
export class Actor {
  /**
   * Get the Agent class this Actor would call, or undefined if the Actor would use
   * the default agent (global.ic.agent).
   * @param actor The actor to get the agent of.
   */
  public static agentOf(actor: Actor): Agent | undefined {
    return actor[metadataSymbol].config.agent;
  }

  /**
   * Get the interface of an actor, in the form of an instance of a Service.
   * @param actor The actor to get the interface of.
   */
  public static interfaceOf(actor: Actor): IDL.ServiceClass {
    return actor[metadataSymbol].service;
  }

  public static canisterIdOf(actor: Actor): Principal {
    return Principal.from(actor[metadataSymbol].config.canisterId);
  }

  public static createActorClass(
    interfaceFactory: IDL.InterfaceFactory,
    options?: CreateActorClassOpts,
  ): ActorConstructor {
    const service = interfaceFactory({ IDL });

    class CanisterActor extends Actor {
      [x: string]: ActorMethod;

      constructor(config: ActorConfig) {
        if (!config.canisterId) {
          throw InputError.fromCode(new MissingCanisterIdErrorCode(config.canisterId));
        }
        const canisterId =
          typeof config.canisterId === 'string'
            ? Principal.fromText(config.canisterId)
            : config.canisterId;

        super({
          config: {
            ...DEFAULT_ACTOR_CONFIG,
            ...config,
            canisterId,
          },
          service,
        });

        for (const [methodName, func] of service._fields) {
          if (options?.httpDetails) {
            func.annotations.push(ACTOR_METHOD_WITH_HTTP_DETAILS);
          }
          if (options?.certificate) {
            func.annotations.push(ACTOR_METHOD_WITH_CERTIFICATE);
          }

          this[methodName] = _createActorMethod(this, methodName, func, config.blsVerify);
        }
      }
    }

    return CanisterActor;
  }

  /**
   * Creates an actor with the given interface factory and configuration.
   *
   * The [`@icp-sdk/bindgen`](https://js.icp.build/bindgen/) package can be used to generate the interface factory for your canister.
   * @param interfaceFactory - the interface factory for the actor, typically generated by the [`@icp-sdk/bindgen`](https://js.icp.build/bindgen/) package
   * @param configuration - the configuration for the actor
   * @returns an actor with the given interface factory and configuration
   * @example
   * Using the interface factory generated by the [`@icp-sdk/bindgen`](https://js.icp.build/bindgen/) package:
   * ```ts
   * import { Actor, HttpAgent } from '@icp-sdk/core/agent';
   * import { Principal } from '@icp-sdk/core/principal';
   * import { idlFactory } from './api/declarations/hello-world.did';
   *
   * const canisterId = Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');
   *
   * const agent = await HttpAgent.create({
   *   host: 'https://icp-api.io',
   * });
   *
   * const actor = Actor.createActor(idlFactory, {
   *   agent,
   *   canisterId,
   * });
   *
   * const response = await actor.greet('world');
   * console.log(response);
   * ```
   * @example
   * Using the `createActor` wrapper function generated by the [`@icp-sdk/bindgen`](https://js.icp.build/bindgen/) package:
   * ```ts
   * import { HttpAgent } from '@icp-sdk/core/agent';
   * import { Principal } from '@icp-sdk/core/principal';
   * import { createActor } from './api/hello-world';
   *
   * const canisterId = Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');
   *
   * const agent = await HttpAgent.create({
   *   host: 'https://icp-api.io',
   * });
   *
   * const actor = createActor(canisterId, {
   *   agent,
   * });
   *
   * const response = await actor.greet('world');
   * console.log(response);
   * ```
   */
  public static createActor<T = Record<string, ActorMethod>>(
    interfaceFactory: IDL.InterfaceFactory,
    configuration: ActorConfig,
  ): ActorSubclass<T> {
    if (!configuration.canisterId) {
      throw InputError.fromCode(new MissingCanisterIdErrorCode(configuration.canisterId));
    }
    return new (this.createActorClass(interfaceFactory))(
      configuration,
    ) as unknown as ActorSubclass<T>;
  }

  /**
   * Returns an actor with methods that return the http response details along with the result
   * @param interfaceFactory - the interface factory for the actor
   * @param configuration - the configuration for the actor
   * @deprecated - use createActor with actorClassOptions instead
   */
  public static createActorWithHttpDetails<T = Record<string, ActorMethod>>(
    interfaceFactory: IDL.InterfaceFactory,
    configuration: ActorConfig,
  ): ActorSubclass<ActorMethodMappedWithHttpDetails<T>> {
    return new (this.createActorClass(interfaceFactory, { httpDetails: true }))(
      configuration,
    ) as unknown as ActorSubclass<ActorMethodMappedWithHttpDetails<T>>;
  }

  /**
   * Returns an actor with methods that return the http response details along with the result
   * @param interfaceFactory - the interface factory for the actor
   * @param configuration - the configuration for the actor
   * @param actorClassOptions - options for the actor class extended details to return with the result
   */
  public static createActorWithExtendedDetails<T = Record<string, ActorMethod>>(
    interfaceFactory: IDL.InterfaceFactory,
    configuration: ActorConfig,
    actorClassOptions: CreateActorClassOpts = {
      httpDetails: true,
      certificate: true,
    },
  ): ActorSubclass<ActorMethodMappedExtended<T>> {
    return new (this.createActorClass(interfaceFactory, actorClassOptions))(
      configuration,
    ) as unknown as ActorSubclass<ActorMethodMappedExtended<T>>;
  }

  private [metadataSymbol]: ActorMetadata;

  protected constructor(metadata: ActorMetadata) {
    this[metadataSymbol] = Object.freeze(metadata);
  }
}

// IDL functions can have multiple return values, so decoding always
// produces an array. Ensure that functions with single or zero return
// values behave as expected.
function decodeReturnValue(types: IDL.Type[], msg: Uint8Array) {
  const returnValues = IDL.decode(types, msg);
  switch (returnValues.length) {
    case 0:
      return undefined;
    case 1:
      return returnValues[0];
    default:
      return returnValues;
  }
}

const DEFAULT_ACTOR_CONFIG: Partial<ActorConfig> = {
  pollingOptions: DEFAULT_POLLING_OPTIONS,
};

export type ActorConstructor = new (config: ActorConfig) => ActorSubclass;

export const ACTOR_METHOD_WITH_HTTP_DETAILS = 'http-details';
export const ACTOR_METHOD_WITH_CERTIFICATE = 'certificate';

function _createActorMethod(
  actor: Actor,
  methodName: string,
  func: IDL.FuncClass,
  blsVerify?: CreateCertificateOptions['blsVerify'],
): ActorMethod {
  let caller: (options: CallConfig, ...args: unknown[]) => Promise<unknown>;
  if (func.annotations.includes('query') || func.annotations.includes('composite_query')) {
    caller = async (options, ...args) => {
      // First, if there's a config transformation, call it.
      options = {
        ...options,
        ...actor[metadataSymbol].config.queryTransform?.(methodName, args, {
          ...actor[metadataSymbol].config,
          ...options,
        }),
      };

      const agent = options.agent || actor[metadataSymbol].config.agent || new HttpAgent();
      const cid = Principal.from(options.canisterId || actor[metadataSymbol].config.canisterId);
      const arg = IDL.encode(func.argTypes, args);

      const result = await agent.query(cid, {
        methodName,
        arg,
        effectiveCanisterId: options.effectiveCanisterId,
      });
      const httpDetails = {
        ...result.httpDetails,
        requestDetails: result.requestDetails,
      } as HttpDetailsResponse;

      switch (result.status) {
        case QueryResponseStatus.Rejected: {
          const uncertifiedRejectErrorCode = new UncertifiedRejectErrorCode(
            result.requestId,
            result.reject_code,
            result.reject_message,
            result.error_code,
            result.signatures,
          );
          uncertifiedRejectErrorCode.callContext = {
            canisterId: cid,
            methodName,
            httpDetails,
          };
          throw RejectError.fromCode(uncertifiedRejectErrorCode);
        }

        case QueryResponseStatus.Replied:
          return func.annotations.includes(ACTOR_METHOD_WITH_HTTP_DETAILS)
            ? {
                httpDetails,
                result: decodeReturnValue(func.retTypes, result.reply.arg),
              }
            : decodeReturnValue(func.retTypes, result.reply.arg);
      }
    };
  } else {
    caller = async (options, ...args) => {
      // First, if there's a config transformation, call it.
      options = {
        ...options,
        ...actor[metadataSymbol].config.callTransform?.(methodName, args, {
          ...actor[metadataSymbol].config,
          ...options,
        }),
      };

      const agent = options.agent || actor[metadataSymbol].config.agent || HttpAgent.createSync();

      const { canisterId, effectiveCanisterId, pollingOptions } = {
        ...DEFAULT_ACTOR_CONFIG,
        ...actor[metadataSymbol].config,
        ...options,
      };
      const cid = Principal.from(canisterId);
      const ecid = effectiveCanisterId !== undefined ? Principal.from(effectiveCanisterId) : cid;
      const arg = IDL.encode(func.argTypes, args);

      const { requestId, response, requestDetails } = await agent.call(cid, {
        methodName,
        arg,
        effectiveCanisterId: ecid,
        nonce: options.nonce,
      });
      let reply: Uint8Array | undefined;
      let certificate: Certificate | undefined;
      if (isV3ResponseBody(response.body)) {
        if (agent.rootKey == null) {
          throw ExternalError.fromCode(new MissingRootKeyErrorCode());
        }
        const cert = response.body.certificate;
        certificate = await Certificate.create({
          certificate: cert,
          rootKey: agent.rootKey,
          canisterId: ecid,
          blsVerify,
          agent,
        });
        const path = [utf8ToBytes('request_status'), requestId];
        const status = new TextDecoder().decode(
          lookupResultToBuffer(certificate.lookup_path([...path, 'status'])),
        );

        switch (status) {
          case 'replied':
            reply = lookupResultToBuffer(certificate.lookup_path([...path, 'reply']));
            break;
          case 'rejected': {
            // Find rejection details in the certificate
            const rejectCode = new Uint8Array(
              lookupResultToBuffer(certificate.lookup_path([...path, 'reject_code']))!,
            )[0];
            const rejectMessage = new TextDecoder().decode(
              lookupResultToBuffer(certificate.lookup_path([...path, 'reject_message']))!,
            );

            const error_code_buf = lookupResultToBuffer(
              certificate.lookup_path([...path, 'error_code']),
            );
            const error_code = error_code_buf
              ? new TextDecoder().decode(error_code_buf)
              : undefined;

            const certifiedRejectErrorCode = new CertifiedRejectErrorCode(
              requestId,
              rejectCode,
              rejectMessage,
              error_code,
            );
            certifiedRejectErrorCode.callContext = {
              canisterId: cid,
              methodName,
              httpDetails: response,
            };
            throw RejectError.fromCode(certifiedRejectErrorCode);
          }
        }
      } else if (isV2ResponseBody(response.body)) {
        const { reject_code, reject_message, error_code } = response.body;
        const errorCode = new UncertifiedRejectUpdateErrorCode(
          requestId,
          reject_code,
          reject_message,
          error_code,
        );
        errorCode.callContext = {
          canisterId: cid,
          methodName,
          httpDetails: response,
        };
        throw RejectError.fromCode(errorCode);
      }

      // Fall back to polling if we receive an Accepted response code
      if (response.status === 202) {
        const pollOptions: PollingOptions = {
          ...pollingOptions,
          blsVerify,
        };
        // Contains the certificate and the reply from the boundary node
        const response = await pollForResponse(agent, ecid, requestId, pollOptions);
        certificate = response.certificate;
        reply = response.reply;
      }
      const shouldIncludeHttpDetails = func.annotations.includes(ACTOR_METHOD_WITH_HTTP_DETAILS);
      const shouldIncludeCertificate = func.annotations.includes(ACTOR_METHOD_WITH_CERTIFICATE);

      const httpDetails = { ...response, requestDetails } as HttpDetailsResponse;
      if (reply !== undefined) {
        if (shouldIncludeHttpDetails && shouldIncludeCertificate) {
          return {
            httpDetails,
            certificate,
            result: decodeReturnValue(func.retTypes, reply),
          };
        } else if (shouldIncludeCertificate) {
          return {
            certificate,
            result: decodeReturnValue(func.retTypes, reply),
          };
        } else if (shouldIncludeHttpDetails) {
          return {
            httpDetails,
            result: decodeReturnValue(func.retTypes, reply),
          };
        }
        return decodeReturnValue(func.retTypes, reply);
      } else {
        const errorCode = new UnexpectedErrorCode(
          `Call was returned undefined. We cannot determine if the call was successful or not. Return types: [${func.retTypes.map(t => t.display()).join(',')}].`,
        );
        errorCode.callContext = {
          canisterId: cid,
          methodName,
          httpDetails,
        };
        throw UnknownError.fromCode(errorCode);
      }
    };
  }

  const handler = (...args: unknown[]) => caller({}, ...args);
  handler.withOptions =
    (options: CallConfig) =>
    (...args: unknown[]) =>
      caller(options, ...args);
  return handler as ActorMethod;
}
