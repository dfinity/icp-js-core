import { Principal } from '#principal';
import {
  CertificateVerificationErrorCode,
  MissingRootKeyErrorCode,
  CertificateNotAuthorizedErrorCode,
  LookupErrorCode,
  DerKeyLengthMismatchErrorCode,
  ExternalError,
  ProtocolError,
  TrustError,
  AgentError,
  UnknownError,
  HashTreeDecodeErrorCode,
  UnexpectedErrorCode,
  InputError,
  CertificateTimeErrorCode,
} from '../errors.ts';
import { HttpAgent } from '../agent/http/index.ts';
import {
  type Cert,
  Certificate,
  flatten_forks,
  check_canister_ranges,
  LookupPathStatus,
  lookup_path,
  lookupResultToBuffer,
  lookup_subtree,
  type LabeledHashTree,
  LookupSubtreeStatus,
} from '../certificate.ts';
import * as cbor from '../cbor.ts';
import { decodeLeb128, decodeTime } from '../utils/leb.ts';
import { type DerEncodedPublicKey } from '../auth.ts';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils';

/**
 * Represents the useful information about a subnet
 * @param {string} subnetId the principal id of the canister's subnet
 * @param {string[]} nodeKeys the keys of the individual nodes in the subnet
 */
export type SubnetStatus = {
  // Principal as a string
  subnetId: string;
  nodeKeys: Map<string, DerEncodedPublicKey>;
  metrics?: {
    num_canisters: bigint;
    canister_state_bytes: bigint;
    consumed_cycles_total: {
      current: bigint;
      deleted: bigint;
    };
    update_transactions_total: bigint;
  };
};

/**
 * Types of an entry on the canisterStatus map.
 * An entry of null indicates that the request failed, due to lack of permissions or the result being missing.
 */
export type Status =
  | string
  | Uint8Array
  | Date
  | Uint8Array[]
  | Principal[]
  | SubnetStatus
  | bigint
  | null;

/**
 * Interface to define a custom path. Nested paths will be represented as individual buffers, and can be created from text using TextEncoder.
 * @param {string} key the key to use to access the returned value in the canisterStatus map
 * @param {Uint8Array[]} path the path to the desired value, represented as an array of buffers
 * @param {string} decodeStrategy the strategy to use to decode the returned value
 */
export class CustomPath implements CustomPath {
  public key: string;
  public path: Uint8Array[] | string;
  public decodeStrategy: 'cbor' | 'hex' | 'leb128' | 'utf-8' | 'raw';
  constructor(
    key: string,
    path: Uint8Array[] | string,
    decodeStrategy: 'cbor' | 'hex' | 'leb128' | 'utf-8' | 'raw',
  ) {
    this.key = key;
    this.path = path;
    this.decodeStrategy = decodeStrategy;
  }
}

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
          console.warn(`Expected to find result for path ${path}, but instead found nothing.`);
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
              if (typeof path !== 'string' && 'key' in path && 'path' in path) {
                switch (path.decodeStrategy) {
                  case 'raw':
                    status.set(path.key, data);
                    break;
                  case 'leb128': {
                    status.set(path.key, decodeLeb128(data));
                    break;
                  }
                  case 'cbor': {
                    status.set(path.key, cbor.decode(data));
                    break;
                  }
                  case 'hex': {
                    status.set(path.key, bytesToHex(data));
                    break;
                  }
                  case 'utf-8': {
                    status.set(path.key, new TextDecoder().decode(data));
                  }
                }
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
        if (typeof path !== 'string' && 'key' in path && 'path' in path) {
          status.set(path.key, null);
        } else {
          status.set(path, null);
        }
        console.group();
        console.warn(`Expected to find result for path ${path}, but instead found nothing.`);
        console.warn(error);
        console.groupEnd();
      }
    })();
  });

  // Fetch all values separately, as each option can fail
  await Promise.all(promises);

  return status;
};

export const fetchNodeKeys = (
  certificate: Uint8Array,
  canisterId: Principal,
  root_key?: Uint8Array,
): SubnetStatus => {
  if (!canisterId._isPrincipal) {
    throw InputError.fromCode(new UnexpectedErrorCode('Invalid canisterId'));
  }
  const cert = cbor.decode<Cert>(certificate);
  const tree = cert.tree;
  let delegation = cert.delegation;
  let subnetId: Principal;
  if (delegation && delegation.subnet_id) {
    subnetId = Principal.fromUint8Array(new Uint8Array(delegation.subnet_id));
  }

  // On local replica, with System type subnet, there is no delegation
  else if (!delegation && typeof root_key !== 'undefined') {
    subnetId = Principal.selfAuthenticating(new Uint8Array(root_key));
    delegation = {
      subnet_id: subnetId.toUint8Array(),
      certificate: new Uint8Array(0),
    };
  }
  // otherwise use default NNS subnet id
  else {
    subnetId = Principal.selfAuthenticating(
      Principal.fromText(
        'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe',
      ).toUint8Array(),
    );
    delegation = {
      subnet_id: subnetId.toUint8Array(),
      certificate: new Uint8Array(0),
    };
  }

  const canisterInRange = check_canister_ranges({ canisterId, subnetId, tree });
  if (!canisterInRange) {
    throw TrustError.fromCode(new CertificateNotAuthorizedErrorCode(canisterId, subnetId));
  }

  const subnetLookupResult = lookup_subtree(['subnet', delegation.subnet_id, 'node'], tree);
  if (subnetLookupResult.status !== LookupSubtreeStatus.Found) {
    throw ProtocolError.fromCode(new LookupErrorCode('Node not found', subnetLookupResult.status));
  }
  if (subnetLookupResult.value instanceof Uint8Array) {
    throw UnknownError.fromCode(new HashTreeDecodeErrorCode('Invalid node tree'));
  }

  // The forks are all labeled trees with the <node_id> label
  const nodeForks = flatten_forks(subnetLookupResult.value) as Array<LabeledHashTree>;
  const nodeKeys = new Map<string, DerEncodedPublicKey>();

  nodeForks.forEach(fork => {
    const node_id = Principal.from(fork[1]).toText();
    const publicKeyLookupResult = lookup_path(['public_key'], fork[2]);
    if (publicKeyLookupResult.status !== LookupPathStatus.Found) {
      throw ProtocolError.fromCode(
        new LookupErrorCode('Public key not found', publicKeyLookupResult.status),
      );
    }

    const derEncodedPublicKey = publicKeyLookupResult.value;
    if (derEncodedPublicKey.byteLength !== 44) {
      throw ProtocolError.fromCode(
        new DerKeyLengthMismatchErrorCode(44, derEncodedPublicKey.byteLength),
      );
    } else {
      nodeKeys.set(node_id, derEncodedPublicKey as DerEncodedPublicKey);
    }
  });

  return {
    subnetId: Principal.fromUint8Array(new Uint8Array(delegation.subnet_id)).toText(),
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
      if ('key' in path && 'path' in path) {
        // For simplified metadata queries
        if (typeof path['path'] === 'string' || path['path'] instanceof Uint8Array) {
          const metaPath = path.path;
          const encoded = typeof metaPath === 'string' ? utf8ToBytes(metaPath) : metaPath;

          return [utf8ToBytes('canister'), canisterUint8Array, utf8ToBytes('metadata'), encoded];

          // For non-metadata, return the provided custompath
        } else {
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

// Controllers are CBOR-encoded buffers
const decodeControllers = (buf: Uint8Array): Principal[] => {
  const controllersRaw = cbor.decode<Uint8Array[]>(buf);
  return controllersRaw.map(buf => {
    return Principal.fromUint8Array(buf);
  });
};
