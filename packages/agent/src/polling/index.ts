import { type RequestId } from '../request_id.ts';
import {
  type CreateCertificateOptions,
  Certificate,
  lookupResultToBuffer,
} from '../certificate.ts';
import { type Agent, type ReadStateResponse } from '../agent/api.ts';
import { Principal } from '@dfinity/principal';
import {
  CertifiedRejectErrorCode,
  ExternalError,
  InputError,
  InvalidReadStateRequestErrorCode,
  MissingRootKeyErrorCode,
  RejectError,
  RequestStatusDoneNoReplyErrorCode,
  UnknownError,
  UNREACHABLE_ERROR,
} from '../errors.ts';

export * as strategy from './strategy.ts';
import { defaultStrategy } from './strategy.ts';
import { ReadRequestType, type ReadStateRequest } from '../agent/http/types.ts';
import { RequestStatusResponseStatus } from '../agent/index.ts';
import { utf8ToBytes } from '@noble/hashes/utils';
export { defaultStrategy } from './strategy.ts';

export type PollStrategy = (
  canisterId: Principal,
  requestId: RequestId,
  status: RequestStatusResponseStatus,
) => Promise<void>;

interface SignedReadStateRequestWithExpiry extends ReadStateRequest {
  body: {
    content: Pick<ReadStateRequest, 'request_type' | 'ingress_expiry'>;
  };
}

/**
 * Options for controlling polling behavior
 */
export interface PollingOptions {
  /**
   * A polling strategy that dictates how much and often we should poll the
   * read_state endpoint to get the result of an update call.
   * @default {@link defaultStrategy}
   */
  strategy?: PollStrategy;

  /**
   * Whether to reuse the same signed request for polling or create a new unsigned request each time.
   * @default false
   */
  preSignReadStateRequest?: boolean;

  /**
   * Optional replacement function that verifies the BLS signature of a certificate.
   */
  blsVerify?: CreateCertificateOptions['blsVerify'];

  /**
   * The request to use for polling. If not provided, a new request will be created.
   * This is only used if `preSignReadStateRequest` is set to false.
   */
  request?: ReadStateRequest;
}

export const DEFAULT_POLLING_OPTIONS: PollingOptions = {
  preSignReadStateRequest: false,
};

/**
 * Check if an object has a property
 * @param value the object that might have the property
 * @param property the key of property we're looking for
 */
function hasProperty<O extends object, P extends string>(
  value: O,
  property: P,
): value is O & Record<P, unknown> {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function isObjectWithProperty<O extends object, P extends string>(
  value: unknown,
  property: P,
): value is O & Record<P, unknown> {
  return value !== null && typeof value === 'object' && hasProperty(value, property);
}

function hasFunction<O extends object, P extends string>(
  value: O,
  property: P,
): value is O & Record<P, (...args: unknown[]) => unknown> {
  return hasProperty(value, property) && typeof value[property] === 'function';
}

/**
 * Check if value is a signed read state request with expiry
 * @param value to check
 */
function isSignedReadStateRequestWithExpiry(
  value: unknown,
): value is SignedReadStateRequestWithExpiry {
  return (
    isObjectWithProperty(value, 'body') &&
    isObjectWithProperty(value.body, 'content') &&
    (value.body.content as { request_type: ReadRequestType }).request_type ===
      ReadRequestType.ReadState &&
    isObjectWithProperty(value.body.content, 'ingress_expiry') &&
    typeof value.body.content.ingress_expiry === 'object' &&
    value.body.content.ingress_expiry !== null &&
    hasFunction(value.body.content.ingress_expiry, 'toHash')
  );
}

/**
 * Polls the IC to check the status of the given request then
 * returns the response bytes once the request has been processed.
 * @param agent The agent to use to poll read_state.
 * @param canisterId The effective canister ID.
 * @param requestId The Request ID to poll status for.
 * @param options polling options to control behavior
 */
export async function pollForResponse(
  agent: Agent,
  canisterId: Principal,
  requestId: RequestId,
  options: PollingOptions = {},
): Promise<{
  certificate: Certificate;
  reply: Uint8Array;
}> {
  const path = [utf8ToBytes('request_status'), requestId];

  let state: ReadStateResponse;
  let currentRequest: ReadStateRequest | undefined;
  const preSignReadStateRequest = options.preSignReadStateRequest ?? false;
  if (preSignReadStateRequest) {
    // If preSignReadStateRequest is true, we need to create a new request
    currentRequest = await constructRequest({
      paths: [path],
      agent,
      pollingOptions: options,
    });
    state = await agent.readState(canisterId, { paths: [path] }, undefined, currentRequest);
  } else {
    // If preSignReadStateRequest is false, we use the default strategy and sign the request each time
    state = await agent.readState(canisterId, { paths: [path] });
  }

  if (agent.rootKey == null) {
    throw ExternalError.fromCode(new MissingRootKeyErrorCode());
  }
  const cert = await Certificate.create({
    certificate: state.certificate,
    rootKey: agent.rootKey,
    canisterId: canisterId,
    blsVerify: options.blsVerify,
    agent,
  });

  const maybeBuf = lookupResultToBuffer(cert.lookup_path([...path, utf8ToBytes('status')]));
  let status;
  if (typeof maybeBuf === 'undefined') {
    // Missing requestId means we need to wait
    status = RequestStatusResponseStatus.Unknown;
  } else {
    status = new TextDecoder().decode(maybeBuf);
  }

  switch (status) {
    case RequestStatusResponseStatus.Replied: {
      return {
        reply: lookupResultToBuffer(cert.lookup_path([...path, 'reply']))!,
        certificate: cert,
      };
    }

    case RequestStatusResponseStatus.Received:
    case RequestStatusResponseStatus.Unknown:
    case RequestStatusResponseStatus.Processing: {
      // Execute the polling strategy, then retry.
      const strategy = options.strategy ?? defaultStrategy();
      await strategy(canisterId, requestId, status);

      return pollForResponse(agent, canisterId, requestId, {
        ...options,
        // Pass over either the strategy already provided or the new one created above
        strategy,
        request: currentRequest,
      });
    }

    case RequestStatusResponseStatus.Rejected: {
      const rejectCode = new Uint8Array(
        lookupResultToBuffer(cert.lookup_path([...path, 'reject_code']))!,
      )[0];
      const rejectMessage = new TextDecoder().decode(
        lookupResultToBuffer(cert.lookup_path([...path, 'reject_message']))!,
      );
      const errorCodeBuf = lookupResultToBuffer(cert.lookup_path([...path, 'error_code']));
      const errorCode = errorCodeBuf ? new TextDecoder().decode(errorCodeBuf) : undefined;
      throw RejectError.fromCode(
        new CertifiedRejectErrorCode(requestId, rejectCode, rejectMessage, errorCode),
      );
    }

    case RequestStatusResponseStatus.Done:
      // This is _technically_ not an error, but we still didn't see the `Replied` status so
      // we don't know the result and cannot decode it.
      throw UnknownError.fromCode(new RequestStatusDoneNoReplyErrorCode(requestId));
  }
  throw UNREACHABLE_ERROR;
}

// Determine if we should reuse the read state request or create a new one
// based on the options provided.

/**
 * Constructs a read state request for the given paths.
 * If the request is already signed and has an expiry, it will be returned as is.
 * Otherwise, a new request will be created.
 * @param options The options to use for creating the request.
 * @param options.paths The paths to read from.
 * @param options.agent The agent to use to create the request.
 * @param options.pollingOptions The options to use for creating the request.
 * @returns The read state request.
 */
export async function constructRequest(options: {
  paths: Uint8Array[][];
  agent: Agent;
  pollingOptions: PollingOptions;
}): Promise<ReadStateRequest> {
  const { paths, agent, pollingOptions } = options;
  if (pollingOptions.request && isSignedReadStateRequestWithExpiry(pollingOptions.request)) {
    return pollingOptions.request;
  }
  const request = await agent.createReadStateRequest?.(
    {
      paths,
    },
    undefined,
  );
  if (!isSignedReadStateRequestWithExpiry(request)) {
    throw InputError.fromCode(new InvalidReadStateRequestErrorCode(request));
  }
  return request;
}
