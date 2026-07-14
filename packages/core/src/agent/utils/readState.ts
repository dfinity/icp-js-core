import { Principal } from '#principal';
import * as cbor from '../cbor.ts';
import { decodeLeb128, decodeTime } from '../utils/leb.ts';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { DerEncodedPublicKey } from '../auth.ts';
import {
  type Cert,
  type CanisterRanges,
  decodeCanisterRanges,
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

export type SubnetNodeKeys = Map<string, DerEncodedPublicKey>;

/**
 * Represents the useful information about a subnet
 */
export interface BaseSubnetStatus {
  /**
   * The subnet ID
   */
  subnetId: string;
  /**
   * The node keys of the subnet
   */
  nodeKeys: SubnetNodeKeys;
  /**
   * Not supported
   */
  metrics?: never;
}

/**
 * Base types of an entry on the status map.
 * An entry of null indicates that the request failed, due to lack of permissions or the result being missing.
 */
export type BaseStatus = string | Uint8Array | Date | Uint8Array[] | Principal[] | bigint | null;

/**
 * Decode strategy for a {@link CustomPath}. `'raw'` returns the looked-up bytes unchanged.
 */
export type DecodeStrategy = 'cbor' | 'hex' | 'leb128' | 'utf-8' | 'raw';

/**
 * A strongly-typed, structured `read_state` path.
 *
 * Builders for the well-known paths are available on {@link StatePaths}, e.g. {@link StatePaths.time}
 * is a `KnownPath<Date>` and {@link StatePaths.canisterControllers} builds a `KnownPath<Principal[]>`
 * for a given canister. Construct your own for arbitrary paths: `path` is the fully-formed sequence
 * of label segments (strings are UTF-8 encoded), including any `['canister', <id>]` or
 * `['subnet', <id>]` prefix.
 *
 * The value at the path is decoded with the `decode` function, and looked up from the response
 * by passing the instance to {@link StateValues.get}.
 * @template T the type produced by decoding the value at this path
 */
export class KnownPath<T> {
  /**
   * A unique token identifying this path in {@link StateValues}.
   */
  public readonly key: symbol = Symbol();
  public readonly path: Uint8Array[];
  constructor(
    path: (Uint8Array | string)[] | Uint8Array | string,
    public readonly decode: (bytes: Uint8Array) => T,
  ) {
    const segments = Array.isArray(path) ? path : [path];
    this.path = segments.map(segment =>
      typeof segment === 'string' ? utf8ToBytes(segment) : segment,
    );
  }
}

/**
 * A `read_state` path defined by the user, with a string {@link DecodeStrategy}. Consumed by the
 * status utilities (e.g. `CanisterStatus.request`), which translate it into a {@link KnownPath}
 * before calling {@link https://js.icp.build/core/latest/libs/agent/api/classes/httpagent#readstate | HttpAgent.readState}.
 * @param {string} key the key to use to access the returned value in the status map
 * @param {Uint8Array[] | Uint8Array | string} path the path to the desired value
 * @param {DecodeStrategy} decodeStrategy the strategy used to decode the returned value
 */
export class CustomPath {
  public key: string;
  public path: Uint8Array[] | Uint8Array | string;
  public decodeStrategy: DecodeStrategy;
  constructor(
    key: string,
    path: Uint8Array[] | Uint8Array | string,
    decodeStrategy: DecodeStrategy,
  ) {
    this.key = key;
    this.path = path;
    this.decodeStrategy = decodeStrategy;
  }
}

/**
 * A path to read from the `read_state` endpoint.
 *
 * May be a {@link KnownPath} (see {@link StatePaths} for the well-known ones) or a raw encoded
 * path (an array of buffers) which is passed through unchanged.
 * {@link https://js.icp.build/core/latest/libs/agent/api/classes/httpagent#readstate | HttpAgent.readState}
 * accepts these directly, encoding them internally.
 */
export type Path = KnownPath<unknown> | Uint8Array[];

/**
 * Builders for the well-known state paths, producing {@link KnownPath}s accepted directly
 * by {@link https://js.icp.build/core/latest/libs/agent/api/classes/httpagent#readstate | HttpAgent.readState}.
 *
 * The `canister*` and `subnet*` entries are functions taking the target ID, since it is baked into
 * the path. Pass the `subnet*` paths when reading state from a subnet (`readState({ subnetId }, …)`)
 * and the `canister*` paths when reading from a canister.
 */
export const StatePaths = {
  /** The canister's or subnet's time, as a {@link Date}. */
  time: new KnownPath(['time'], decodeTime),
  /**
   * The given canister's controllers, as {@link Principal}s.
   * @param canisterId the canister to scope the path to
   */
  canisterControllers: (canisterId: Principal): KnownPath<Principal[]> =>
    new KnownPath(['canister', canisterId.toUint8Array(), 'controllers'], decodeControllers),
  /**
   * The given canister's module hash, hex-encoded.
   * @param canisterId the canister to scope the path to
   */
  canisterModuleHash: (canisterId: Principal): KnownPath<string> =>
    new KnownPath(['canister', canisterId.toUint8Array(), 'module_hash'], bytesToHex),
  /**
   * The given canister's `candid:service` metadata, as a UTF-8 string.
   * @param canisterId the canister to scope the path to
   */
  canisterCandid: (canisterId: Principal): KnownPath<string> =>
    new KnownPath(
      ['canister', canisterId.toUint8Array(), 'metadata', 'candid:service'],
      bytes => new TextDecoder().decode(bytes),
    ),
  /**
   * The given subnet's canister ID ranges.
   * @param subnetId the subnet to scope the path to
   */
  subnetCanisterRanges: (subnetId: Principal): KnownPath<CanisterRanges> =>
    new KnownPath(['canister_ranges', subnetId.toUint8Array()], decodeCanisterRanges),
  /**
   * The given subnet's public key, as raw bytes.
   * @param subnetId the subnet to scope the path to
   */
  subnetPublicKey: (subnetId: Principal): KnownPath<Uint8Array> =>
    new KnownPath(['subnet', subnetId.toUint8Array(), 'public_key'], bytes => bytes),
} as const;

/**
 * The decoded values returned by {@link https://js.icp.build/core/latest/libs/agent/api/classes/httpagent#readstate | HttpAgent.readState},
 * keyed by {@link KnownPath}. Look values up by passing the same {@link KnownPath} instance that
 * was requested; the return type follows the path's type parameter.
 */
export class StateValues {
  readonly #values: Map<symbol, unknown>;
  constructor(values: Map<symbol, unknown> = new Map()) {
    this.#values = values;
  }

  /**
   * The decoded value for `path`, or `null` if it was absent from the certificate or not requested.
   * @param path the {@link KnownPath} whose value to read
   */
  get<T>(path: KnownPath<T>): T | null {
    return (this.#values.get(path.key) ?? null) as T | null;
  }
}

/**
 * Encode a {@link Path} into the raw path expected by the `read_state` endpoint.
 * @param path the path to encode
 * @returns the encoded path, as an array of buffers
 */
export function encodePath(path: Path): Uint8Array[] {
  // A raw encoded path passes through unchanged; a KnownPath is already fully-formed.
  return Array.isArray(path) ? path : path.path;
}

/**
 * Decode a value based on the specified strategy
 * @param data the raw data to decode
 * @param strategy the decode strategy to use
 * @returns the decoded value
 */
export function decodeValue(data: Uint8Array, strategy: DecodeStrategy): BaseStatus {
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
): SubnetNodeKeys {
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
