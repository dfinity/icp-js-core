import {
  EmptyHashTree,
  ForkHashTree,
  HashTree,
  LabeledHashTree,
  LeafHashTree,
  NodeHash,
  NodeLabel,
  NodeType,
  NodeValue,
  PrunedHashTree,
  RequestId,
  RequestStatusResponseStatus,
  Cbor,
} from '@icp-sdk/core/agent';
import { lebEncode } from '@icp-sdk/core/candid';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Creates an empty hash tree.
 * @returns {EmptyHashTree} An empty hash tree.
 */
export function empty(): EmptyHashTree {
  return [NodeType.Empty];
}

/**
 * Creates a fork hash tree with two branches.
 * @param {HashTree} l - The left branch of the fork.
 * @param {HashTree} r - The right branch of the fork.
 * @returns {ForkHashTree} A fork hash tree.
 */
export function fork(l: HashTree, r: HashTree): ForkHashTree {
  return [NodeType.Fork, l, r];
}

/**
 * Creates a labeled hash tree.
 * @param {string | Uint8Array | NodeLabel} l - The label for the tree.
 * @param {HashTree} e - The subtree associated with the label.
 * @returns {LabeledHashTree} A labeled hash tree.
 */
export function labeled(l: string | Uint8Array | NodeLabel, e: HashTree): LabeledHashTree {
  const coerced = (typeof l === 'string' ? utf8ToBytes(l) : l) as NodeLabel;

  return [NodeType.Labeled, coerced, e];
}

/**
 * Creates a leaf hash tree.
 * @param {string | Uint8Array | NodeValue} e - The value of the leaf.
 * @returns {LeafHashTree} A leaf hash tree.
 */
export function leaf(e: string | Uint8Array | NodeValue): LeafHashTree {
  const coerced = (typeof e === 'string' ? utf8ToBytes(e) : e) as NodeValue;

  return [NodeType.Leaf, coerced];
}

/**
 * Creates a pruned hash tree.
 * @param {string} e - The hexadecimal string representing the pruned node.
 * @returns {PrunedHashTree} A pruned hash tree.
 */
export function pruned(e: string): PrunedHashTree {
  return [NodeType.Pruned, hexToBytes(e) as NodeHash];
}

/**
 * Encodes a date into a LEB128 encoded Uint8Array.
 * @param {Date} date - The date to encode.
 * @returns {Uint8Array} A LEB128 encoded Uint8Array.
 */
export function time(date: Date): Uint8Array {
  return new Uint8Array(lebEncode(date.getTime() * 1_000_000));
}

interface ReplyTreeOptions {
  requestId: string | Uint8Array | RequestId;
  reply: string | Uint8Array;
  date: Date;
}

/**
 * Creates a reply hash tree for a request.
 * @param {ReplyTreeOptions} options - The options for the reply tree.
 * @param {string | Uint8Array | RequestId} options.requestId - The ID of the request.
 * @param {string | Uint8Array} options.reply - The reply content.
 * @param {Date} options.date - The timestamp of the reply.
 * @returns {HashTree} A reply hash tree.
 */
export function createReplyTree({ requestId, reply, date }: ReplyTreeOptions): HashTree {
  // prettier-ignore
  return fork(
    labeled('request_status',
      labeled(requestId,
        fork(
          labeled('status', leaf(RequestStatusResponseStatus.Replied)),
          labeled('reply', leaf(reply)),
        ),
      ),
    ),
    createTimeTree(date),
  );
}

/**
 * Creates a time hash tree.
 * @param {Date} date - The timestamp for the tree.
 * @returns {HashTree} A time hash tree.
 */
export function createTimeTree(date: Date): HashTree {
  return labeled('time', leaf(time(date)));
}

interface SubnetTreeOptions {
  subnetId: Uint8Array;
  subnetPublicKey: Uint8Array;
  nodeIdentity: Ed25519KeyIdentity;
  canisterRanges: Array<[Uint8Array, Uint8Array]>;
  date: Date;
}

/**
 * Creates a subnet hash tree.
 * @param {SubnetTreeOptions} options - The options for the subnet tree.
 * @param {Uint8Array} options.subnetId - The ID of the subnet.
 * @param {Uint8Array} options.subnetPublicKey - The DER-encoded public key of the subnet.
 * @param {Ed25519KeyIdentity} options.nodeIdentity - The identity of the node.
 * @param {Array<[Uint8Array, Uint8Array]>} options.canisterRanges - The canister ranges for the subnet.
 * @param {Date} options.date - The timestamp for the tree.
 * @returns {HashTree} A subnet hash tree.
 */
export function createSubnetTree({
  subnetId,
  subnetPublicKey,
  nodeIdentity,
  canisterRanges,
  date,
}: SubnetTreeOptions): HashTree {
  // prettier-ignore
  return fork(
    labeled('subnet',
      labeled(subnetId,
        fork(
          fork(
            labeled('canister_ranges', leaf(Cbor.encode(canisterRanges))),
            labeled('node',
              labeled(nodeIdentity.getPrincipal().toUint8Array(),
                labeled('public_key', leaf(nodeIdentity.getPublicKey().toDer())),
              ),
            ),
          ),
          labeled('public_key', leaf(subnetPublicKey)),
        ),
      ),
    ),
    createTimeTree(date),
  );
}
