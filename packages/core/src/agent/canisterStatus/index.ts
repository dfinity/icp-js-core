import { Principal } from '#principal';
import {
  CertificateVerificationErrorCode,
  MissingRootKeyErrorCode,
  ExternalError,
  AgentError,
  UnexpectedErrorCode,
  InputError,
  CertificateTimeErrorCode,
} from '../errors.ts';
import type { HttpAgent } from '../agent/http/index.ts';
import type { Cert } from '../certificate.ts';
import * as cbor from '../cbor.ts';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  type BaseSubnetStatus,
  type BaseStatus,
  type CustomPath,
  KnownPath,
  StatePaths,
  decodeValue,
  lookupNodeKeysFromCertificate,
  IC_ROOT_SUBNET_ID,
} from '../utils/readState.ts';

// Re-export shared types for backwards compatibility
export { type DecodeStrategy, CustomPath } from '../utils/readState.ts';

export type SubnetStatus = BaseSubnetStatus;
export type Status = BaseStatus | SubnetStatus;

/**
 * Pre-configured fields for canister status paths
 */
export type Path = 'time' | 'controllers' | 'subnet' | 'module_hash' | 'candid' | CustomPath;

export type StatusMap = Map<Path | string, Status>;

/**
 * The {@link StatePaths} field backing each named (non-`subnet`) canister status path. The `subnet`
 * path is handled separately, as its value is derived from the raw certificate.
 */
const NAMED_PATHS = {
  time: StatePaths.time,
  controllers: StatePaths.controllers,
  module_hash: StatePaths.moduleHash,
  candid: StatePaths.candid,
} satisfies Record<Exclude<Path, CustomPath | 'subnet'>, KnownPath<Status>>;

/**
 * Translate a user-provided {@link CustomPath} into a {@link KnownPath} that {@link HttpAgent.readState}
 * can encode and decode. A string or single-buffer path names a canister metadata entry.
 * @param custom the user-provided custom path
 */
const customToKnown = (custom: CustomPath): KnownPath<BaseStatus> => {
  const decode = (bytes: Uint8Array): BaseStatus => decodeValue(bytes, custom.decodeStrategy);
  if (typeof custom.path === 'string' || custom.path instanceof Uint8Array) {
    return new KnownPath(['metadata', custom.path], decode, true);
  }
  return new KnownPath(custom.path, decode, false);
};

export interface CanisterStatusOptions {
  /**
   * The effective canister ID to use in the underlying {@link HttpAgent.readState} call.
   */
  canisterId: Principal;
  /**
   * The agent to use to make the canister request. Must be authenticated.
   */
  agent: HttpAgent;
  /**
   * The paths to request.
   * @default []
   */
  paths?: Path[] | Set<Path>;
  /**
   * Whether to disable the certificate freshness checks.
   * @default false
   */
  disableCertificateTimeVerification?: boolean;
}

/**
 * Requests information from a canister's `read_state` endpoint.
 * Can be used to request information about the canister's controllers, time, module hash, candid interface, and more.
 *
 * > [!WARNING]
 * > Requesting the `subnet` path from the canister status might be deprecated in the future.
 * > Use {@link https://js.icp.build/core/latest/libs/agent/api/namespaces/subnetstatus/functions/request | SubnetStatus.request} to fetch subnet information instead.
 * @deprecated Call {@link https://js.icp.build/core/latest/libs/agent/api/classes/httpagent#readstate | HttpAgent.readState}
 * directly with {@link StatePaths} (or your own {@link KnownPath}s) and read the decoded values off
 * {@link import('../agent/api.ts').ReadStateResponse.values | ReadStateResponse.values}.
 * @param {CanisterStatusOptions} options The configuration for the canister status request.
 * @see {@link CanisterStatusOptions} for detailed options.
 * @returns {Promise<StatusMap>} A map populated with data from the requested paths. Each path is a key in the map, and the value is the data obtained from the certificate for that path.
 * @example
 * const status = await canisterStatus({
 *   paths: ['controllers', 'candid'],
 *   ...options
 * });
 *
 * const controllers = status.get('controllers');
 */
export const request = async (options: CanisterStatusOptions): Promise<StatusMap> => {
  const { agent, paths, disableCertificateTimeVerification = false } = options;
  const canisterId = Principal.from(options.canisterId);

  const uniquePaths = [...new Set(paths)];
  const status: StatusMap = new Map();

  const keyOf = (path: Path): string => (typeof path === 'string' ? path : path.key);

  const promises = uniquePaths.map(async path => {
    try {
      if (agent.rootKey === null) {
        throw ExternalError.fromCode(new MissingRootKeyErrorCode());
      }
      const rootKey = agent.rootKey;

      // The subnet path resolves to node keys, which require parsing the raw certificate.
      if (path === 'subnet') {
        const response = await agent.readState(
          { canisterId },
          {
            paths: [[utf8ToBytes('subnet')]],
            disableTimeVerification: disableCertificateTimeVerification,
          },
        );
        status.set('subnet', fetchNodeKeys(response.certificate, canisterId, rootKey));
        return;
      }

      // Translate to a KnownPath and let readState encode and decode it.
      const known: KnownPath<Status> =
        typeof path === 'string' ? NAMED_PATHS[path] : customToKnown(path);
      const { values } = await agent.readState(
        { canisterId },
        {
          paths: [known],
          disableTimeVerification: disableCertificateTimeVerification,
        },
      );
      status.set(keyOf(path), values.get(known));
    } catch (error) {
      // Throw on certificate errors
      if (
        error instanceof AgentError &&
        (error.hasCode(CertificateVerificationErrorCode) ||
          error.hasCode(CertificateTimeErrorCode))
      ) {
        throw error;
      }
      status.set(keyOf(path), null);
    }
  });

  // Fetch all values separately, as each option can fail
  await Promise.all(promises);

  return status;
};

/**
 * Lookup node keys from a certificate for a given canister.
 * The certificate is assumed to be already verified, including whether the canister is in range of the subnet.
 * @param certificate the certificate to lookup node keys from
 * @param canisterId the canister ID to lookup node keys for
 * @param root_key the root key to use to lookup node keys
 * @returns a map of node IDs to public keys
 */
export const fetchNodeKeys = (
  certificate: Uint8Array,
  canisterId: Principal,
  root_key?: Uint8Array,
): BaseSubnetStatus => {
  if (!canisterId._isPrincipal) {
    throw InputError.fromCode(new UnexpectedErrorCode('Invalid canisterId'));
  }
  const cert = cbor.decode<Cert>(certificate);
  const { delegation } = cert;
  let subnetId: Principal;
  if (delegation && delegation.subnet_id) {
    subnetId = Principal.fromUint8Array(new Uint8Array(delegation.subnet_id));
  } else if (!delegation && typeof root_key !== 'undefined') {
    // On local replica, with System type subnet, there is no delegation
    subnetId = Principal.selfAuthenticating(new Uint8Array(root_key));
  } else {
    // otherwise use default NNS subnet id
    subnetId = IC_ROOT_SUBNET_ID;
  }

  const nodeKeys = lookupNodeKeysFromCertificate(cert, subnetId);

  return {
    subnetId: subnetId.toText(),
    nodeKeys,
  };
};

export { encodePath } from '../utils/readState.ts';
