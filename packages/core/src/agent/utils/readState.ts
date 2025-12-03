import { Principal } from '#principal';
import * as cbor from '../cbor.ts';
import { decodeLeb128 } from '../utils/leb.ts';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { type DerEncodedPublicKey } from '../auth.ts';
import {
  type Cert,
  flatten_forks,
  LookupPathStatus,
  lookup_path,
  lookup_subtree,
  type LabeledHashTree,
  LookupSubtreeStatus,
} from '../certificate.ts';
import {
  LookupErrorCode,
  DerKeyLengthMismatchErrorCode,
  ProtocolError,
  UnknownError,
  HashTreeDecodeErrorCode,
} from '../errors.ts';

/**
 * The root subnet ID for IC mainnet
 */
export const IC_ROOT_SUBNET_ID = Principal.fromText(
  'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe',
);

/**
 * Represents the useful information about a subnet
 * @param {string} subnetId the principal id of the canister's subnet
 * @param {string[]} nodeKeys the keys of the individual nodes in the subnet
 */
export type SubnetStatus = {
  // Principal as a string
  subnetId: string;
  nodeKeys: Map<string, DerEncodedPublicKey>;
  metrics?: SubnetMetrics;
};

/**
 * Subnet metrics data structure
 */
export type SubnetMetrics = {
  num_canisters: bigint;
  canister_state_bytes: bigint;
  consumed_cycles_total: {
    current: bigint;
    deleted: bigint;
  };
  update_transactions_total: bigint;
};

/**
 * Types of an entry on the status map.
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

export type StatusMap<P> = Map<P | string, Status>;

/**
 * Decode strategy for custom paths
 */
export type DecodeStrategy = 'cbor' | 'hex' | 'leb128' | 'utf-8' | 'raw';

/**
 * Interface to define a custom path. Nested paths will be represented as individual buffers, and can be created from text using TextEncoder.
 * @param {string} key the key to use to access the returned value in the status map
 * @param {Uint8Array[]} path the path to the desired value, represented as an array of buffers
 * @param {string} decodeStrategy the strategy to use to decode the returned value
 */
export class CustomPath implements CustomPath {
  public key: string;
  public path: Uint8Array[] | string;
  public decodeStrategy: DecodeStrategy;
  constructor(key: string, path: Uint8Array[] | string, decodeStrategy: DecodeStrategy) {
    this.key = key;
    this.path = path;
    this.decodeStrategy = decodeStrategy;
  }
}

/**
 * Decode a value based on the specified strategy
 * @param data the raw data to decode
 * @param strategy the decode strategy to use
 * @returns the decoded value
 */
export function decodeValue(data: Uint8Array, strategy: DecodeStrategy): Status {
  switch (strategy) {
    case 'raw':
      return data;
    case 'leb128':
      return decodeLeb128(data);
    case 'cbor':
      return cbor.decode(data);
    case 'hex':
      return bytesToHex(data);
    case 'utf-8':
      return new TextDecoder().decode(data);
  }
}

/**
 * Decode controllers from CBOR-encoded buffer
 * @param buf the CBOR-encoded buffer to decode
 * @returns an array of principal IDs
 */
export function decodeControllers(buf: Uint8Array): Principal[] {
  const controllersRaw = cbor.decode<Uint8Array[]>(buf);
  return controllersRaw.map(buf => {
    return Principal.fromUint8Array(buf);
  });
}

/**
 * Encode a metadata path for canister metadata queries
 * @param metaPath the metadata path (string or Uint8Array)
 * @param canisterUint8Array the canister ID as Uint8Array
 * @returns the encoded path
 */
export function encodeMetadataPath(
  metaPath: string | Uint8Array,
  canisterUint8Array: Uint8Array,
): Uint8Array[] {
  const encoded = typeof metaPath === 'string' ? utf8ToBytes(metaPath) : metaPath;
  return [utf8ToBytes('canister'), canisterUint8Array, utf8ToBytes('metadata'), encoded];
}

/**
 * Check if a path object has custom path signature (has 'key' and 'path' properties)
 * @param path the path to check
 * @returns true if the path has custom path signature, false otherwise
 */
export function isCustomPath<T>(path: T): path is T & { key: string; path: unknown } {
  return typeof path === 'object' && path !== null && 'key' in path && 'path' in path;
}

/**
 * Lookup node keys from a certificate for a given subnet
 * This can be used for both canister and subnet status queries
 * @param certificate the certificate to fetch node keys from
 * @param subnetId the subnet ID to fetch node keys for
 * @returns a map of node IDs to public keys
 */
export function lookupNodeKeysFromCertificate(
  certificate: Cert,
  subnetId: Principal,
): Map<string, DerEncodedPublicKey> {
  const subnetLookupResult = lookup_subtree(
    ['subnet', subnetId.toUint8Array(), 'node'],
    certificate.tree,
  );
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

  return nodeKeys;
}
