import { Principal } from '#principal';
import {
  CertificateVerificationErrorCode,
  MissingRootKeyErrorCode,
  ExternalError,
  AgentError,
  UnknownError,
  UnexpectedErrorCode,
  CertificateTimeErrorCode,
  ProtocolError,
  LookupErrorCode,
} from '../errors.ts';
import { HttpAgent } from '../agent/http/index.ts';
import {
  type Cert,
  type CanisterRanges,
  Certificate,
  lookupResultToBuffer,
  decodeCanisterRanges,
  lookup_path,
  LookupPathStatus,
} from '../certificate.ts';
import * as cbor from '../cbor.ts';
import { decodeTime } from '../utils/leb.ts';
import { utf8ToBytes } from '@noble/hashes/utils';
import {
  type BaseStatus,
  type BaseSubnetStatus,
  type SubnetNodeKeys,
  CustomPath,
  decodeValue,
  isCustomPath,
  lookupNodeKeysFromCertificate,
  IC_ROOT_SUBNET_ID,
} from '../utils/readState.ts';

// Re-export shared types and functions
export { type DecodeStrategy, CustomPath, IC_ROOT_SUBNET_ID } from '../utils/readState.ts';

export type SubnetStatus = BaseSubnetStatus & {
  /**
   * The public key of the subnet
   */
  publicKey: Uint8Array;
};

export type Status = BaseStatus | SubnetNodeKeys | CanisterRanges;

/**
 * Pre-configured fields for subnet status paths
 */
export type Path = 'time' | 'canisterRanges' | 'publicKey' | 'nodeKeys' | CustomPath;

export type StatusMap = Map<Path | string, Status>;

export type SubnetStatusOptions = {
  /**
   * The subnet ID to query. Use {@link IC_ROOT_SUBNET_ID} for the IC mainnet root subnet.
   * You can use {@link HttpAgent.getSubnetIdFromCanister} to get a subnet ID from a canister.
   */
  subnetId: Principal;
  /**
   * The agent to use to make the subnet request.
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
 * Requests information from a subnet's `read_state` endpoint.
 * Can be used to request information about the subnet's time, canister ranges, public key, node keys, and metrics.
 * @param {SubnetStatusOptions} options The configuration for the subnet status request.
 * @see {@link SubnetStatusOptions} for detailed options.
 * @returns {Promise<StatusMap>} A map populated with data from the requested paths. Each path is a key in the map, and the value is the data obtained from the certificate for that path.
 * @example
 * const status = await subnetStatus.request({
 *   subnetId: IC_ROOT_SUBNET_ID,
 *   paths: ['time', 'nodeKeys'],
 *   agent,
 * });
 *
 * const time = status.get('time');
 * const nodeKeys = status.get('nodeKeys');
 */
export async function request(options: SubnetStatusOptions): Promise<StatusMap> {
  const { agent, paths, disableCertificateTimeVerification = false } = options;
  const subnetId = Principal.from(options.subnetId);

  const uniquePaths = [...new Set(paths)];
  const status = new Map<string | Path, Status>();

  const promises = uniquePaths.map((path, index) => {
    const encodedPath = encodePath(path, subnetId);

    return (async () => {
      try {
        if (agent.rootKey === null) {
          throw ExternalError.fromCode(new MissingRootKeyErrorCode());
        }

        const rootKey = agent.rootKey;

        const response = await agent.readSubnetState(subnetId, {
          paths: [encodedPath],
        });

        const certificate = await Certificate.create({
          certificate: response.certificate,
          rootKey,
          principal: { subnetId },
          disableTimeVerification: disableCertificateTimeVerification,
          agent,
        });

        const lookup = (cert: Certificate, lookupPath: Path) => {
          if (lookupPath === 'nodeKeys') {
            // For node keys, we need to parse the certificate directly
            const data = lookupNodeKeysFromCertificate(cert.cert, subnetId);
            return {
              path: lookupPath,
              data,
            };
          } else {
            return {
              path: lookupPath,
              data: lookupResultToBuffer(cert.lookup_path(encodedPath)),
            };
          }
        };

        const { path, data } = lookup(certificate, uniquePaths[index]);
        if (!data) {
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
            case 'canisterRanges': {
              status.set(path, decodeCanisterRanges(data));
              break;
            }
            case 'publicKey': {
              status.set(path, data);
              break;
            }
            case 'nodeKeys': {
              status.set(path, data);
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
}

/**
 * Fetch subnet info including node keys from a certificate
 * @param certificate the certificate bytes
 * @param subnetId the subnet ID
 * @returns SubnetStatus with subnet ID and node keys
 */
export function lookupSubnetInfo(certificate: Uint8Array, subnetId: Principal): SubnetStatus {
  const cert = cbor.decode<Cert>(certificate);
  const nodeKeys = lookupNodeKeysFromCertificate(cert, subnetId);
  const publicKey = lookupSubnetPublicKey(cert, subnetId);

  return {
    subnetId: subnetId.toText(),
    nodeKeys,
    publicKey,
  };
}

function lookupSubnetPublicKey(certificate: Cert, subnetId: Principal): Uint8Array {
  const subnetLookupResult = lookup_path(
    ['subnet', subnetId.toUint8Array(), 'public_key'],
    certificate.tree,
  );
  if (subnetLookupResult.status !== LookupPathStatus.Found) {
    throw ProtocolError.fromCode(
      new LookupErrorCode('Public key not found', subnetLookupResult.status),
    );
  }
  return subnetLookupResult.value;
}

/**
 * Encode a path for subnet state queries
 * @param path the path to encode
 * @param subnetId the subnet ID
 * @returns the encoded path as an array of Uint8Arrays
 */
export function encodePath(path: Path, subnetId: Principal): Uint8Array[] {
  const subnetUint8Array = subnetId.toUint8Array();
  switch (path) {
    case 'time':
      return [utf8ToBytes('time')];
    case 'canisterRanges':
      return [utf8ToBytes('canister_ranges'), subnetUint8Array];
    case 'publicKey':
      return [utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('public_key')];
    case 'nodeKeys':
      return [utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('node')];
    default: {
      // Check for CustomPath signature
      if (isCustomPath(path)) {
        if (typeof path['path'] === 'string' || path['path'] instanceof Uint8Array) {
          // For string paths, treat as a subnet path segment
          const encoded =
            typeof path['path'] === 'string' ? utf8ToBytes(path['path']) : path['path'];
          return [utf8ToBytes('subnet'), subnetUint8Array, encoded];
        } else {
          // For non-simple paths, return the provided custom path
          return path['path'];
        }
      }
    }
  }
  throw UnknownError.fromCode(
    new UnexpectedErrorCode(
      `Error while encoding your path for subnet status. Please ensure that your path ${path} was formatted correctly.`,
    ),
  );
}
