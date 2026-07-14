import { Principal } from '#principal';
import {
  CertificateVerificationErrorCode,
  AgentError,
  UnknownError,
  UnexpectedErrorCode,
  CertificateTimeErrorCode,
  ProtocolError,
  LookupErrorCode,
} from '../errors.ts';
import type { HttpAgent } from '../agent/http/index.ts';
import {
  type Cert,
  type CanisterRanges,
  lookup_path,
  LookupPathStatus,
} from '../certificate.ts';
import * as cbor from '../cbor.ts';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  type BaseStatus,
  type BaseSubnetStatus,
  type SubnetNodeKeys,
  type CustomPath,
  KnownPath,
  StatePaths,
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

/**
 * Build the {@link KnownPath} for a named (non-`nodeKeys`) subnet status path. `nodeKeys` is handled
 * separately, as its value is derived from the raw certificate.
 * @param path the named subnet status path
 * @param subnetId the subnet the request targets
 */
const namedToKnown = (
  path: Exclude<Path, CustomPath | 'nodeKeys'>,
  subnetId: Principal,
): KnownPath<Status> => {
  switch (path) {
    case 'time':
      return StatePaths.time;
    case 'publicKey':
      return StatePaths.subnetPublicKey(subnetId);
    case 'canisterRanges':
      return StatePaths.subnetCanisterRanges(subnetId);
  }
};

/**
 * Translate a user-provided {@link CustomPath} into a {@link KnownPath} that {@link HttpAgent.readState}
 * can encode and decode. A string or single-buffer path names a segment under the subnet subtree.
 * @param custom the user-provided custom path
 * @param subnetId the subnet to scope a simple path to
 */
const customToKnown = (custom: CustomPath, subnetId: Principal): KnownPath<BaseStatus> => {
  const decode = (bytes: Uint8Array): BaseStatus => decodeValue(bytes, custom.decodeStrategy);
  if (typeof custom.path === 'string' || custom.path instanceof Uint8Array) {
    return new KnownPath(['subnet', subnetId.toUint8Array(), custom.path], decode);
  }
  return new KnownPath(custom.path, decode);
};

export interface SubnetStatusOptions {
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
}

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
  const status: StatusMap = new Map();

  const keyOf = (path: Path): string => (typeof path === 'string' ? path : path.key);

  const promises = uniquePaths.map(async path => {
    try {
      // The nodeKeys path resolves to per-node public keys, which require parsing the raw certificate.
      if (path === 'nodeKeys') {
        const { verifiedCertificate } = await agent.readState(
          { subnetId },
          {
            paths: [[utf8ToBytes('subnet'), subnetId.toUint8Array(), utf8ToBytes('node')]],
            disableTimeVerification: disableCertificateTimeVerification,
          },
        );
        status.set('nodeKeys', lookupNodeKeysFromCertificate(verifiedCertificate.cert, subnetId));
        return;
      }

      // Translate to a KnownPath and let readState encode and decode it.
      const known: KnownPath<Status> =
        typeof path === 'string' ? namedToKnown(path, subnetId) : customToKnown(path, subnetId);
      const { values } = await agent.readState(
        { subnetId },
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
        }
        // For non-simple paths, return the provided custom path
        return path['path'];
      }
    }
  }
  throw UnknownError.fromCode(
    new UnexpectedErrorCode(
      `Error while encoding your path for subnet status. Please ensure that your path ${path} was formatted correctly.`,
    ),
  );
}
