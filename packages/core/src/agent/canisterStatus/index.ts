import { Principal } from '#principal';
import {
  CertificateVerificationErrorCode,
  MissingRootKeyErrorCode,
  ExternalError,
  AgentError,
  UnknownError,
  UnexpectedErrorCode,
  InputError,
  CertificateTimeErrorCode,
} from '../errors.ts';
import { HttpAgent } from '../agent/http/index.ts';
import { type Cert, Certificate, lookupResultToBuffer } from '../certificate.ts';
import * as cbor from '../cbor.ts';
import { decodeTime } from '../utils/leb.ts';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';
import {
  type BaseSubnetStatus,
  type BaseStatus,
  CustomPath,
  decodeValue,
  decodeControllers,
  encodeMetadataPath,
  isCustomPath,
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

export type CanisterStatusOptions = {
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
};

/**
 * Requests information from a canister's `read_state` endpoint.
 * Can be used to request information about the canister's controllers, time, module hash, candid interface, and more.
 *
 * > [!WARNING]
 * > Requesting the `subnet` path from the canister status might be deprecated in the future.
 * > Use {@link https://js.icp.build/core/latest/libs/agent/api/namespaces/subnetstatus/functions/request | SubnetStatus.request} to fetch subnet information instead.
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
  const status = new Map<string | Path, Status>();

  const promises = uniquePaths.map((path, index) => {
    const encodedPath = encodePath(path, canisterId);

    return (async () => {
      try {
        if (agent.rootKey === null) {
          throw ExternalError.fromCode(new MissingRootKeyErrorCode());
        }

        const rootKey = agent.rootKey;

        const response = await agent.readState(canisterId, {
          paths: [encodedPath],
        });

        const certificate = await Certificate.create({
          certificate: response.certificate,
          rootKey,
          principal: { canisterId },
          disableTimeVerification: disableCertificateTimeVerification,
          agent,
        });

        const lookup = (cert: Certificate, path: Path) => {
          if (path === 'subnet') {
            const data = fetchNodeKeys(response.certificate, canisterId, rootKey);
            return {
              path,
              data,
            };
          } else {
            return {
              path,
              data: lookupResultToBuffer(cert.lookup_path(encodedPath)),
            };
          }
        };

        // must pass in the rootKey if we have no delegation
        const { path, data } = lookup(certificate, uniquePaths[index]);
        if (!data) {
          // Typically, the cert lookup will throw
          if (typeof path === 'string') {
            status.set(path, null);
          } else {
            status.set(path.key, null);
          }
        } else {
          switch (path) {
            case 'time': {
              status.set(path, decodeTime(data));
              break;
            }
            case 'controllers': {
              status.set(path, decodeControllers(data));
              break;
            }
            case 'module_hash': {
              status.set(path, bytesToHex(data));
              break;
            }
            case 'subnet': {
              status.set(path, data);
              break;
            }
            case 'candid': {
              status.set(path, new TextDecoder().decode(data));
              break;
            }
            default: {
              // Check for CustomPath signature
              if (isCustomPath(path)) {
                status.set(path.key, decodeValue(data, path.decodeStrategy));
              }
            }
          }
        }
      } catch (error) {
        // Throw on certificate errors
        if (
          error instanceof AgentError &&
          (error.hasCode(CertificateVerificationErrorCode) ||
            error.hasCode(CertificateTimeErrorCode))
        ) {
          throw error;
        }
        if (isCustomPath(path)) {
          status.set(path.key, null);
        } else {
          status.set(path, null);
        }
      }
    })();
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

export const encodePath = (path: Path, canisterId: Principal): Uint8Array[] => {
  const canisterUint8Array = canisterId.toUint8Array();
  switch (path) {
    case 'time':
      return [utf8ToBytes('time')];
    case 'controllers':
      return [utf8ToBytes('canister'), canisterUint8Array, utf8ToBytes('controllers')];
    case 'module_hash':
      return [utf8ToBytes('canister'), canisterUint8Array, utf8ToBytes('module_hash')];
    case 'subnet':
      return [utf8ToBytes('subnet')];
    case 'candid':
      return [
        utf8ToBytes('canister'),
        canisterUint8Array,
        utf8ToBytes('metadata'),
        utf8ToBytes('candid:service'),
      ];
    default: {
      // Check for CustomPath signature
      if (isCustomPath(path)) {
        // For simplified metadata queries
        if (typeof path['path'] === 'string' || path['path'] instanceof Uint8Array) {
          return encodeMetadataPath(path.path, canisterUint8Array);
        } else {
          // For non-metadata, return the provided custom path
          return path['path'];
        }
      }
    }
  }
  throw UnknownError.fromCode(
    new UnexpectedErrorCode(
      `Error while encoding your path for canister status. Please ensure that your path ${path} was formatted correctly.`,
    ),
  );
};
