/**
 * Need this to setup the proper ArrayBuffer type (otherwise in jest ArrayBuffer isn't
 * an instance of ArrayBuffer).
 * @jest-environment node
 */
import * as cbor from './cbor.ts';
import * as Cert from './certificate.ts';
import { Principal } from '#principal';
import { decodeTime } from './utils/leb.ts';
import { readFileSync } from 'fs';
import path from 'path';
import { type Agent, HttpAgent, IC_ROOT_KEY } from './agent/index.ts';
import {
  CertificateHasTooManyDelegationsErrorCode,
  CertificateNotAuthorizedErrorCode,
  CertificateNotAuthorizedForSubnetErrorCode,
  CertificateTimeErrorCode,
  CertificateVerificationErrorCode,
  LookupErrorCode,
  ProtocolError,
  TrustError,
  UnexpectedErrorCode,
  UnknownError,
  UNREACHABLE_ERROR,
} from './errors.ts';
import { utf8ToBytes, hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { uint8Equals } from './utils/buffer.ts';
import { goldenCertificates } from './agent/http/__certificates__/goldenCertificates.ts';

const MINUTES_TO_MSEC = 60 * 1000;

function label(str: string): Cert.NodeLabel {
  return utf8ToBytes(str) as Cert.NodeLabel;
}

function pruned(str: string): Cert.NodeHash {
  return hexToBytes(str) as Cert.NodeHash;
}

function value(str: string): Cert.NodeValue {
  return utf8ToBytes(str) as Cert.NodeValue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(expect as any).addEqualityTesters([uint8Equals]);

function normalizeTree(tree: Cert.HashTree): string {
  return JSON.stringify(tree);
}

test('hash tree', async () => {
  const cborEncode = hexToBytes(
    '8301830183024161830183018302417882034568656c6c6f810083024179820345776f726c64' +
      '83024162820344676f6f648301830241638100830241648203476d6f726e696e67',
  );
  const expected: Cert.HashTree = [
    Cert.NodeType.Fork,
    [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('a'),
        [
          Cert.NodeType.Fork,
          [
            Cert.NodeType.Fork,
            [Cert.NodeType.Labeled, label('x'), [Cert.NodeType.Leaf, value('hello')]],
            [Cert.NodeType.Empty],
          ],
          [Cert.NodeType.Labeled, label('y'), [Cert.NodeType.Leaf, value('world')]],
        ],
      ],
      [Cert.NodeType.Labeled, label('b'), [Cert.NodeType.Leaf, value('good')]],
    ],
    [
      Cert.NodeType.Fork,
      [Cert.NodeType.Labeled, label('c'), [Cert.NodeType.Empty]],
      [Cert.NodeType.Labeled, label('d'), [Cert.NodeType.Leaf, value('morning')]],
    ],
  ];
  const tree: Cert.HashTree = cbor.decode(new Uint8Array(cborEncode));
  expect(normalizeTree(tree)).toEqual(normalizeTree(expected));

  expect(bytesToHex(await Cert.reconstruct(tree))).toEqual(
    'eb5c5b2195e62d996b84c9bcc8259d19a83786a2f59e0878cec84c811f669aa0',
  );
});

test('pruned hash tree', async () => {
  const cborEncode = hexToBytes(
    '83018301830241618301820458201b4feff9bef8131788b0c9dc6dbad6e81e524249c879e9f1' +
      '0f71ce3749f5a63883024179820345776f726c6483024162820458207b32ac0c6ba8ce35ac' +
      '82c255fc7906f7fc130dab2a090f80fe12f9c2cae83ba6830182045820ec8324b8a1f1ac16' +
      'bd2e806edba78006479c9877fed4eb464a25485465af601d830241648203476d6f726e696e67',
  );
  const expected: Cert.HashTree = [
    Cert.NodeType.Fork,
    [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('a'),
        [
          Cert.NodeType.Fork,
          [4, pruned('1b4feff9bef8131788b0c9dc6dbad6e81e524249c879e9f10f71ce3749f5a638')],
          [Cert.NodeType.Labeled, label('y'), [Cert.NodeType.Leaf, value('world')]],
        ],
      ],
      [
        Cert.NodeType.Labeled,
        label('b'),
        [
          Cert.NodeType.Pruned,
          pruned('7b32ac0c6ba8ce35ac82c255fc7906f7fc130dab2a090f80fe12f9c2cae83ba6'),
        ],
      ],
    ],
    [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Pruned,
        pruned('ec8324b8a1f1ac16bd2e806edba78006479c9877fed4eb464a25485465af601d'),
      ],
      [Cert.NodeType.Labeled, label('d'), [Cert.NodeType.Leaf, value('morning')]],
    ],
  ];
  const tree: Cert.HashTree = cbor.decode(new Uint8Array(cborEncode));
  expect(normalizeTree(tree)).toEqual(normalizeTree(expected));
  expect(bytesToHex(await Cert.reconstruct(tree))).toEqual(
    'eb5c5b2195e62d996b84c9bcc8259d19a83786a2f59e0878cec84c811f669aa0',
  );
});

describe('lookup_path and find_label', () => {
  const tree: Cert.HashTree = [
    Cert.NodeType.Fork,
    [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Fork,
        [
          Cert.NodeType.Labeled,
          label('a'),
          [
            Cert.NodeType.Pruned,
            pruned('1b842dfc254abb83e61bcdd7b7c24492322a2e1b006e6d20b88bedd147c248fc'),
          ],
        ],
        [Cert.NodeType.Labeled, label('c'), [Cert.NodeType.Leaf, value('hello')]],
      ],
      [
        Cert.NodeType.Labeled,
        label('d'),
        [
          Cert.NodeType.Fork,
          [Cert.NodeType.Labeled, label('1'), [Cert.NodeType.Leaf, value('42')]],
          [
            Cert.NodeType.Pruned,
            pruned('5ec92bd71f697eee773919200a9718c4719495a4c6bba52acc408bd79b4bf57f'),
          ],
        ],
      ],
    ],
    [
      Cert.NodeType.Fork,
      [Cert.NodeType.Labeled, label('e'), [Cert.NodeType.Leaf, value('world')]],
      [Cert.NodeType.Labeled, label('g'), [Cert.NodeType.Empty]],
    ],
  ];

  test('subtree_a', () => {
    // a subtree at label `a` exists
    const lookup_a = Cert.find_label(label('a'), tree);
    expect(lookup_a).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [
        Cert.NodeType.Pruned,
        pruned('1b842dfc254abb83e61bcdd7b7c24492322a2e1b006e6d20b88bedd147c248fc'),
      ],
    });
    expect(Cert.lookup_path([label('a')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [
        Cert.NodeType.Pruned,
        pruned('1b842dfc254abb83e61bcdd7b7c24492322a2e1b006e6d20b88bedd147c248fc'),
      ],
    });

    // the subtree at label `a` is pruned,
    // so any nested lookups should return Unknown
    const tree_a = (lookup_a as Cert.LookupLabelResultFound).value;

    expect(Cert.find_label(label('1'), tree_a)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('1')], tree_a)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('a'), label('1')], tree)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });

    expect(Cert.find_label(label('2'), tree_a)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('2')], tree_a)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('a'), label('2')], tree)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
  });

  test('subtree_b', () => {
    // there are no nodes between labels `a` and `c`,
    // so the subtree at label `b` is provably Absent
    expect(Cert.find_label(label('b'), tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('b')], tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
  });

  test('subtree_c', () => {
    // a subtree at label `c` exists
    expect(Cert.find_label(label('c'), tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [Cert.NodeType.Leaf, label('hello')],
    });
    expect(Cert.lookup_path([label('c')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: label('hello'),
    });
  });

  test('subtree_d', () => {
    // a subtree at label `d` exists
    const lookup_d = Cert.find_label(label('d'), tree);
    expect(lookup_d).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [
        Cert.NodeType.Fork,
        [Cert.NodeType.Labeled, label('1'), [Cert.NodeType.Leaf, label('42')]],
        [
          Cert.NodeType.Pruned,
          pruned('5ec92bd71f697eee773919200a9718c4719495a4c6bba52acc408bd79b4bf57f'),
        ],
      ],
    });
    expect(Cert.lookup_path([label('d')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [
        Cert.NodeType.Fork,
        [Cert.NodeType.Labeled, label('1'), [Cert.NodeType.Leaf, label('42')]],
        [
          Cert.NodeType.Pruned,
          pruned('5ec92bd71f697eee773919200a9718c4719495a4c6bba52acc408bd79b4bf57f'),
        ],
      ],
    });

    const tree_d = (lookup_d as Cert.LookupLabelResultFound).value;
    // a subtree at label `1` exists in the subtree at label `d`
    expect(Cert.find_label(label('1'), tree_d)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [Cert.NodeType.Leaf, label('42')],
    });
    expect(Cert.lookup_path([label('1')], tree_d)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: label('42'),
    });
    expect(Cert.lookup_path([label('d'), label('1')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: label('42'),
    });

    // the rest of the subtree at label `d` is pruned,
    // so any more lookups return Unknown
    expect(Cert.find_label(label('2'), tree_d)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('2')], tree_d)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
    expect(Cert.lookup_path([label('d'), label('2')], tree)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
  });

  test('subtree_e', () => {
    // a subtree at label `e` exists
    expect(Cert.find_label(label('e'), tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [Cert.NodeType.Leaf, label('world')],
    });
    expect(Cert.lookup_path([label('e')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: label('world'),
    });
  });

  test('subtree_f', () => {
    // there are no nodes between labels `e` and `g`,
    // so the subtree at `f` is provably Absent
    expect(Cert.find_label(label('f'), tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('f')], tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
  });

  test('subtree_g', () => {
    // a subtree at label `g` exists
    const lookup_g = Cert.find_label(label('g'), tree);
    expect(lookup_g).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [Cert.NodeType.Empty],
    });
    expect(Cert.lookup_path([label('g')], tree)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: [Cert.NodeType.Empty],
    });

    // the subtree at label `g` is empty so any nested lookup are provably Absent
    const tree_g = (lookup_g as Cert.LookupLabelResultFound).value;
    expect(Cert.find_label(label('1'), tree_g)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('1')], tree_g)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('g'), label('1')], tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });

    expect(Cert.find_label(label('2'), tree_g)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('2')], tree_g)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
    expect(Cert.lookup_path([label('g'), label('2')], tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
  });

  test('returns absent when node is empty', () => {
    const tree: Cert.HashTree = [Cert.NodeType.Empty];
    expect(Cert.lookup_path([], tree)).toEqual({
      status: Cert.LookupPathStatus.Absent,
    });
  });

  test('returns unknown when node is pruned', () => {
    const tree: Cert.HashTree = [
      Cert.NodeType.Pruned,
      pruned('1b842dfc254abb83e61bcdd7b7c24492322a2e1b006e6d20b88bedd147c248fc'),
    ];
    expect(Cert.lookup_path([], tree)).toEqual({
      status: Cert.LookupPathStatus.Unknown,
    });
  });

  test('invalid leaf node throws an error', () => {
    // Create an invalid leaf node (missing leaf value)
    const invalidLeaf = [Cert.NodeType.Leaf] as unknown as Cert.HashTree;

    // Direct lookup on invalid leaf should throw
    expect(() => Cert.lookup_path([], invalidLeaf)).toThrow('Invalid tree structure for leaf');

    // Create a tree with an invalid leaf node
    const treeWithInvalidLeaf: Cert.HashTree = [
      Cert.NodeType.Fork,
      [Cert.NodeType.Labeled, label('invalid'), invalidLeaf],
      [Cert.NodeType.Labeled, label('valid'), [Cert.NodeType.Leaf, value('hello')]],
    ];

    // Lookup path to invalid leaf should throw
    expect(() => Cert.lookup_path([label('invalid')], treeWithInvalidLeaf)).toThrow(
      'Invalid tree structure for leaf',
    );

    // Lookup path to valid leaf should still work
    expect(Cert.lookup_path([label('valid')], treeWithInvalidLeaf)).toEqual({
      status: Cert.LookupPathStatus.Found,
      value: label('hello'),
    });
  });

  test('returns error when path is incomplete for Fork node', () => {
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [Cert.NodeType.Labeled, label('a'), [Cert.NodeType.Leaf, value('value')]],
      [Cert.NodeType.Empty],
    ];

    const result = Cert.lookup_path([], tree);
    expect(result.status).toEqual(Cert.LookupPathStatus.Error);
  });

  test('returns error when path is incomplete for Labeled node', () => {
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('a'),
        [Cert.NodeType.Fork, [Cert.NodeType.Empty], [Cert.NodeType.Empty]],
      ],
      [Cert.NodeType.Empty],
    ];

    const result = Cert.lookup_path([label('a')], tree);
    expect(result.status).toEqual(Cert.LookupPathStatus.Error);
  });

  test('returns error when path is incomplete for nested structure', () => {
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('a'),
        [
          Cert.NodeType.Fork,
          [Cert.NodeType.Labeled, label('b'), [Cert.NodeType.Leaf, value('value')]],
          [Cert.NodeType.Empty],
        ],
      ],
      [Cert.NodeType.Empty],
    ];

    const result = Cert.lookup_path([label('a')], tree);
    expect(result.status).toEqual(Cert.LookupPathStatus.Error);
  });

  test('throws the unreachable error if the HashTree is malformed', () => {
    const tree = [5, [Cert.NodeType.Empty], [Cert.NodeType.Empty]] as unknown as Cert.HashTree;
    expect(() => Cert.lookup_path([], tree)).toThrow(UNREACHABLE_ERROR);
  });
});

describe('lookup_path with different value types', () => {
  test('handles ArrayBuffer values', () => {
    const buffer = new Uint8Array(4);
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [Cert.NodeType.Labeled, label('arraybuffer'), [Cert.NodeType.Leaf, buffer as Cert.NodeValue]],
      [Cert.NodeType.Empty],
    ];

    const result = Cert.lookup_path([label('arraybuffer')], tree) as Cert.LookupPathResultFound;
    expect(result.status).toEqual(Cert.LookupPathStatus.Found);
    expect(result.value).toBeInstanceOf(Uint8Array);
  });

  test('handles Uint8Array values', () => {
    const uint8Array = new Uint8Array(4);
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('uint8array'),
        [Cert.NodeType.Leaf, uint8Array as Cert.NodeValue],
      ],
      [Cert.NodeType.Empty],
    ];

    const result = Cert.lookup_path([label('uint8array')], tree) as Cert.LookupPathResultFound;
    expect(result.status).toEqual(Cert.LookupPathStatus.Found);
    expect(result.value).toBeInstanceOf(Uint8Array);
  });

  test('throws the unreachable error if the value is not an ArrayBuffer or Uint8Array', () => {
    const tree: Cert.HashTree = [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('unreachable'),
        [Cert.NodeType.Leaf, 'not an ArrayBuffer or Uint8Array' as unknown as Cert.NodeValue],
      ],
      [Cert.NodeType.Empty],
    ];

    expect(() => Cert.lookup_path([label('unreachable')], tree)).toThrow(UNREACHABLE_ERROR);
  });
});

describe('lookup_subtree', () => {
  const tree: Cert.HashTree = [
    Cert.NodeType.Fork,
    [
      Cert.NodeType.Fork,
      [
        Cert.NodeType.Labeled,
        label('a'),
        [
          Cert.NodeType.Pruned,
          pruned('1b842dfc254abb83e61bcdd7b7c24492322a2e1b006e6d20b88bedd147c248fc'),
        ],
      ],
      [Cert.NodeType.Labeled, label('c'), [Cert.NodeType.Leaf, value('hello')]],
    ],
    [
      Cert.NodeType.Labeled,
      label('d'),
      [
        Cert.NodeType.Fork,
        [Cert.NodeType.Labeled, label('1'), [Cert.NodeType.Leaf, value('42')]],
        [
          Cert.NodeType.Pruned,
          pruned('5ec92bd71f697eee773919200a9718c4719495a4c6bba52acc408bd79b4bf57f'),
        ],
      ],
    ],
  ];

  test('empty path returns full tree', () => {
    const result = Cert.lookup_subtree([], tree) as Cert.LookupSubtreeResultFound;
    expect(result.status).toEqual(Cert.LookupSubtreeStatus.Found);
    expect(result.value).toEqual(tree);
  });

  test('empty path returns full tree', () => {
    const result = Cert.lookup_subtree([], tree) as Cert.LookupSubtreeResultFound;
    expect(result.status).toEqual(Cert.LookupPathStatus.Found);
    expect(result.value).toEqual(tree);
  });

  test('valid path returns subtree', () => {
    const result = Cert.lookup_subtree(
      [label('d'), label('1')],
      tree,
    ) as Cert.LookupSubtreeResultFound;
    expect(result.status).toEqual(Cert.LookupPathStatus.Found);
    expect(JSON.stringify(result.value)).toEqual(JSON.stringify([Cert.NodeType.Leaf, value('42')]));
  });

  test('pruned path returns unknown', () => {
    const result = Cert.lookup_subtree([label('a'), label('x')], tree);
    expect(result.status).toEqual(Cert.LookupPathStatus.Unknown);
  });

  test('non-existent path returns absent', () => {
    const result = Cert.lookup_subtree([label('b')], tree);
    expect(result.status).toEqual(Cert.LookupPathStatus.Absent);
  });
});

// The sample certificate for testing delegation is extracted from the response used in agent-rs tests, where they were taken
// from an interaction with the IC mainnet.
// The time in the certificate tree is 2022-02-23T07:38:00.652Z.
// The time in the delegation.certificate tree is 2022-02-17T10:17:49.668Z.
const SAMPLE_CERT_BYTES: Uint8Array = hexToBytes(
  'd9d9f7a364747265658301830182045820250f5e26868d9c1ea7ab29cbe9c15bf1c47c0d7605e803e39e375a7fe09c6ebb830183024e726571756573745f7374617475738301820458204b268227774ec77ff2b37ecb12157329d54cf376694bdd59ded7803efd82386f83025820edad510eaaa08ed2acd4781324e6446269da6753ec17760f206bbe81c465ff528301830183024b72656a6563745f636f64658203410383024e72656a6563745f6d6573736167658203584443616e69737465722069766733372d71696161612d61616161622d61616167612d63616920686173206e6f20757064617465206d6574686f64202772656769737465722783024673746174757382034872656a65637465648204582097232f31f6ab7ca4fe53eb6568fc3e02bc22fe94ab31d010e5fb3c642301f1608301820458203a48d1fc213d49307103104f7d72c2b5930edba8787b90631f343b3aa68a5f0a83024474696d65820349e2dc939091c696eb16697369676e6174757265583089a2be21b5fa8ac9fab1527e041327ce899d7da971436a1f2165393947b4d942365bfe5488710e61a619ba48388a21b16a64656c65676174696f6ea2697375626e65745f6964581dd77b2a2f7199b9a8aec93fe6fb588661358cf12223e9a3af7b4ebac4026b6365727469666963617465590231d9d9f7a26474726565830182045820ae023f28c3b9d966c8fb09f9ed755c828aadb5152e00aaf700b18c9c067294b483018302467375626e6574830182045820e83bb025f6574c8f31233dc0fe289ff546dfa1e49bd6116dd6e8896d90a4946e830182045820e782619092d69d5bebf0924138bd4116b0156b5a95e25c358ea8cf7e7161a661830183018204582062513fa926c9a9ef803ac284d620f303189588e1d3904349ab63b6470856fc4883018204582060e9a344ced2c9c4a96a0197fd585f2d259dbd193e4eada56239cac26087f9c58302581dd77b2a2f7199b9a8aec93fe6fb588661358cf12223e9a3af7b4ebac402830183024f63616e69737465725f72616e6765738203581bd9d9f781824a000000000020000001014a00000000002fffff010183024a7075626c69635f6b657982035885308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c050302010361009933e1f89e8a3c4d7fdcccdbd518089e2bd4d8180a261f18d9c247a52768ebce98dc7328a39814a8f911086a1dd50cbe015e2a53b7bf78b55288893daa15c346640e8831d72a12bdedd979d28470c34823b8d1c3f4795d9c3984a247132e94fe82045820996f17bb926be3315745dea7282005a793b58e76afeb5d43d1a28ce29d2d158583024474696d6582034995b8aac0e4eda2ea16697369676e61747572655830ace9fcdd9bc977e05d6328f889dc4e7c99114c737a494653cb27a1f55c06f4555e0f160980af5ead098acc195010b2f7',
);

const parseTimeFromCert = (cert: Uint8Array): Date => {
  const certObj = cbor.decode<Cert.Cert>(cert);
  if (!certObj.tree) throw new Error('Invalid certificate');
  const lookup = Cert.lookupResultToBuffer(Cert.lookup_path(['time'], certObj.tree));
  if (!lookup) throw new Error('Invalid certificate');

  return decodeTime(lookup);
};

test('time lookup', async () => {
  const cert = cbor.decode<Cert.Cert>(SAMPLE_CERT_BYTES);
  const certTimeLookup = Cert.lookupResultToBuffer(Cert.lookup_path(['time'], cert.tree));
  const certTime = decodeTime(certTimeLookup!);
  expect(certTime.toISOString()).toEqual('2022-02-23T07:38:00.652Z');
  // the helper function should give the same result
  expect(parseTimeFromCert(SAMPLE_CERT_BYTES)).toEqual(certTime);
});

test('delegation time lookup', async () => {
  const cert = cbor.decode<Cert.Cert>(SAMPLE_CERT_BYTES);
  const delegationCert = cbor.decode<Cert.Cert>(cert.delegation!.certificate);
  const delegationTimeLookup = Cert.lookupResultToBuffer(
    Cert.lookup_path(['time'], delegationCert.tree),
  );
  const delegationTime = decodeTime(delegationTimeLookup!);
  expect(delegationTime.toISOString()).toEqual('2022-02-17T10:17:49.668Z');
  // the helper function should give the same result
  expect(parseTimeFromCert(cert.delegation!.certificate)).toEqual(delegationTime);
});

test('delegation works for canisters within the subnet range', async () => {
  jest.setSystemTime(parseTimeFromCert(SAMPLE_CERT_BYTES));
  // The certificate specifies the range from
  // 0x00000000002000000101
  // to
  // 0x00000000002FFFFF0101
  const rangeStart = Principal.fromHex('00000000002000000101');
  const rangeInterior = Principal.fromHex('000000000020000C0101');
  const rangeEnd = Principal.fromHex('00000000002FFFFF0101');
  async function verifies(canisterId: Principal) {
    await expect(
      Cert.Certificate.create({
        certificate: SAMPLE_CERT_BYTES,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { canisterId },
        blsVerify: async () => true,
      }),
    ).resolves.not.toThrow();
  }
  await verifies(rangeStart);
  await verifies(rangeInterior);
  await verifies(rangeEnd);
});

test('delegation check fails for canisters outside of the subnet range', async () => {
  jest.setSystemTime(parseTimeFromCert(SAMPLE_CERT_BYTES));
  // Use a different principal than the happy path, which isn't in the delegation ranges.
  // The certificate specifies the range from
  // 0x00000000002000000101
  // to
  // 0x00000000002FFFFF0101
  const beforeRange = Principal.fromHex('00000000000000020101');
  const afterRange = Principal.fromHex('00000000003000020101');
  async function certificateFails(canisterId: Principal) {
    try {
      await Cert.Certificate.create({
        certificate: SAMPLE_CERT_BYTES,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { canisterId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TrustError);
      expect((error as TrustError).cause.code).toBeInstanceOf(CertificateNotAuthorizedErrorCode);
    }
  }
  expect.assertions(4);
  await certificateFails(beforeRange);
  await certificateFails(afterRange);
});

test('certificate verification fails for an invalid signature', async () => {
  jest.setSystemTime(parseTimeFromCert(SAMPLE_CERT_BYTES));

  const badCert = cbor.decode<Cert.Cert>(SAMPLE_CERT_BYTES);
  badCert.signature = new Uint8Array(badCert.signature.byteLength); // replace the signature with an empty bytes array
  const badCertEncoded = cbor.encode(badCert);

  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: badCertEncoded,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateVerificationErrorCode);
  }
});

test('certificate verification fails if the time of the certificate is > 5 minutes in the past', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
  }
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the past, but time check is disabled', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest.fn();
  agent.hasSyncedTime = jest.fn();
  agent.syncTime = jest.fn();

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    disableTimeVerification: true,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
  expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(0);
  expect(agent.hasSyncedTime).toHaveBeenCalledTimes(0);
  expect(agent.syncTime).toHaveBeenCalledTimes(0);
});

test('certificate creation fails if the time of the certificate is > 5 minutes in the past, non-HttpAgent agent is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
      agent: {} as Agent,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
  }
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the past, but agent is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  // Simulate a clock drift of 6 minutes in the past, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the future compared to the certificate time,
  // which is within the default 5 minute max certificate age window.
  const timeDiffMsecs = -6 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest
    .fn()
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn(() => false);
  agent.syncTime = jest.fn();

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    agent,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
  expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(4);
  expect(agent.hasSyncedTime).toHaveBeenCalledTimes(1);
  expect(agent.syncTime).toHaveBeenCalledTimes(1);
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the past, but agent with an already synced time is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  // Simulate a clock drift of 6 minutes in the past, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the future compared to the certificate time,
  // which is within the default 5 minute max certificate age window.
  const timeDiffMsecs = -6 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest.fn(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn(() => true);
  agent.syncTime = jest.fn();

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    agent,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
  expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(2);
  expect(agent.hasSyncedTime).toHaveBeenCalledTimes(0);
  expect(agent.syncTime).toHaveBeenCalledTimes(0);
});

test('certificate creation fails if the time of the certificate is > 5 minutes in the past, but agent with an already synced time that is too far in the past is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  const timeDiffMsecs = -3 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest.fn(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn(() => true);
  agent.syncTime = jest.fn();

  expect.assertions(5);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
      agent,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
    expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(2);
    expect(agent.hasSyncedTime).toHaveBeenCalledTimes(1);
    expect(agent.syncTime).toHaveBeenCalledTimes(0);
  }
});

test('certificate creation fails if the time of the certificate is > max age minutes in the past (agent provided)', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  const maxAgeInMinutes = 1;
  // Simulate a clock drift of 6 minutes in the past, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the future compared to the certificate time,
  // which is still outside the 1 minute max certificate age window.
  const timeDiffMsecs = -6 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest
    .fn()
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => timeDiffMsecs);
  agent.hasSyncedTime = jest
    .fn()
    .mockImplementationOnce(() => false)
    .mockImplementationOnce(() => true);
  agent.syncTime = jest.fn();

  expect.assertions(5);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
      maxAgeInMinutes,
      agent,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
    expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(4);
    expect(agent.hasSyncedTime).toHaveBeenCalledTimes(2);
    expect(agent.syncTime).toHaveBeenCalledTimes(1);
  }
});

test('certificate verification fails if the time of the certificate is > 5 minutes in the future', async () => {
  const tenMinutesPast = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesPast));
  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
  }
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the future, but time check is disabled', async () => {
  const tenMinutesPast = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesPast));

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    disableTimeVerification: true,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
});

test('certificate verification fails if the time of the certificate is > 5 minutes in the future, non-HttpAgent agent is provided', async () => {
  const tenMinutesPast = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesPast));
  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
      agent: {} as Agent,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
  }
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the future, but agent is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  // Simulate a clock drift of 6 minutes in the future, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the past compared to the certificate time,
  // which is within the default 5 minute max certificate age window.
  const timeDiffMsecs = 6 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest
    .fn()
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => 0)
    .mockImplementationOnce(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn(() => false);
  agent.syncTime = jest.fn();

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    agent,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
  expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(4);
  expect(agent.hasSyncedTime).toHaveBeenCalledTimes(1);
  expect(agent.syncTime).toHaveBeenCalledTimes(1);
});

test('certificate creation passes if the time of the certificate is > 5 minutes in the future, but agent with an already synced time is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  // Simulate a clock drift of 6 minutes in the future, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the past compared to the certificate time,
  // which is within the default 5 minute max certificate age window.
  const timeDiffMsecs = 6 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest.fn(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn();
  agent.syncTime = jest.fn();

  const cert = await Cert.Certificate.create({
    certificate: SAMPLE_CERT_BYTES,
    rootKey: hexToBytes(IC_ROOT_KEY),
    principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
    blsVerify: async () => true,
    agent,
  });
  expect(cert).toBeInstanceOf(Cert.Certificate);
  expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(2);
  expect(agent.hasSyncedTime).toHaveBeenCalledTimes(0);
  expect(agent.syncTime).toHaveBeenCalledTimes(0);
});

test('certificate creation fails if the time of the certificate is > 5 minutes in the future, but agent with an already synced time that is too far in the future is provided', async () => {
  const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() - 10 * MINUTES_TO_MSEC;
  jest.setSystemTime(new Date(tenMinutesFuture));
  // Simulate a clock drift of 6 minutes in the future, in order to test the clock drift compensation.
  // As a result, we expect the current adjusted time to be only 4 minutes in the past compared to the certificate time,
  // which is within the default 5 minute max certificate age window.
  const timeDiffMsecs = 3 * MINUTES_TO_MSEC;

  const agent = HttpAgent.createSync({
    fetch: jest.fn(),
  });
  agent.getTimeDiffMsecs = jest.fn(() => timeDiffMsecs);
  agent.hasSyncedTime = jest.fn(() => true);
  agent.syncTime = jest.fn();

  expect.assertions(5);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId: Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai') },
      blsVerify: async () => true,
      agent,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(UnknownError);
    expect((error as UnknownError).cause.code).toBeInstanceOf(UnexpectedErrorCode);
    expect(agent.getTimeDiffMsecs).toHaveBeenCalledTimes(2);
    expect(agent.hasSyncedTime).toHaveBeenCalledTimes(2);
    expect(agent.syncTime).toHaveBeenCalledTimes(0);
  }
});

test('certificate verification fails on nested delegations', async () => {
  // This is a recorded certificate from a read_state request to the II
  // subnet, with the /subnet tree included. Thus, it could be used as its
  // own delegation, according to the old interface spec definition.
  const withSubnetSubtree = new Uint8Array(
    readFileSync(path.join(__dirname, 'bin/with_subnet_key.bin')),
  );
  const canisterId = Principal.fromText('rdmx6-jaaaa-aaaaa-aaadq-cai');
  const subnetId = Principal.fromText(
    'uzr34-akd3s-xrdag-3ql62-ocgoh-ld2ao-tamcv-54e7j-krwgb-2gm4z-oqe',
  );
  jest.setSystemTime(new Date(Date.parse('2023-12-12T10:40:00.652Z')));
  const cert: Cert.Cert = cbor.decode(withSubnetSubtree);
  const overlyNested = cbor.encode({
    tree: cert.tree,
    signature: cert.signature,
    delegation: {
      subnet_id: subnetId.toUint8Array(),
      certificate: withSubnetSubtree,
    },
  });
  expect.assertions(4);
  try {
    await Cert.Certificate.create({
      certificate: overlyNested,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).cause.code).toBeInstanceOf(
      CertificateHasTooManyDelegationsErrorCode,
    );
  }
  try {
    await Cert.Certificate.create({
      certificate: overlyNested,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { canisterId },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).cause.code).toBeInstanceOf(
      CertificateHasTooManyDelegationsErrorCode,
    );
  }
});

test('certificate verification fails if a subnet ID is provided as the principal', async () => {
  jest.setSystemTime(parseTimeFromCert(SAMPLE_CERT_BYTES));

  expect.assertions(2);
  try {
    await Cert.Certificate.create({
      certificate: SAMPLE_CERT_BYTES,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: {
        subnetId: Principal.fromText(
          'utdle-wwxpm-vc64m-zxguk-5sj74-35vrb-tbgwg-pcird-5gr2x-52oxl-bea',
        ),
      },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(
      CertificateNotAuthorizedForSubnetErrorCode,
    );
  }
});

describe('subnet certificates', () => {
  const certBytes = hexToBytes(goldenCertificates.mainnetApplicationO3ow2);
  const certTime = parseTimeFromCert(certBytes).getTime();
  const subnetId = Principal.fromText(
    'o3ow2-2ipam-6fcjo-3j5vt-fzbge-2g7my-5fz2m-p4o2t-dwlc4-gt2q7-5ae',
  );

  beforeEach(() => {
    jest.setSystemTime(certTime);
  });

  it('certificate creation passes if the certificate is from a subnet', async () => {
    const cert = await Cert.Certificate.create({
      certificate: certBytes,
      rootKey: hexToBytes(IC_ROOT_KEY),
      principal: { subnetId },
    });
    expect(cert).toBeInstanceOf(Cert.Certificate);
  });

  it('certificate creation fails if the certificate is from another subnet', async () => {
    const anotherSubnetId = Principal.fromText(
      'uzr34-akd3s-xrdag-3ql62-ocgoh-ld2ao-tamcv-54e7j-krwgb-2gm4z-oqe',
    );

    expect.assertions(2);
    try {
      await Cert.Certificate.create({
        certificate: certBytes,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { subnetId: anotherSubnetId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TrustError);
      expect((error as TrustError).cause.code).toBeInstanceOf(
        CertificateNotAuthorizedForSubnetErrorCode,
      );
    }
  });

  test('certificate verification fails if the time of the certificate is > 5 minutes in the past', async () => {
    const tenMinutesFuture = parseTimeFromCert(SAMPLE_CERT_BYTES).getTime() + 10 * MINUTES_TO_MSEC;
    jest.setSystemTime(new Date(tenMinutesFuture));

    expect.assertions(2);
    try {
      await Cert.Certificate.create({
        certificate: certBytes,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { subnetId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TrustError);
      expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
    }
  });

  it('certificate verification fails if the time of the certificate is > 5 minutes in the future', async () => {
    const tenMinutesPast = certTime - 10 * MINUTES_TO_MSEC;
    jest.setSystemTime(new Date(tenMinutesPast));

    expect.assertions(2);
    try {
      await Cert.Certificate.create({
        certificate: certBytes,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { subnetId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TrustError);
      expect((error as TrustError).cause.code).toBeInstanceOf(CertificateTimeErrorCode);
    }
  });

  it('certificate verification fails if a canister ID is provided as the principal', async () => {
    const canisterId = Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai');

    expect.assertions(2);
    try {
      await Cert.Certificate.create({
        certificate: certBytes,
        rootKey: hexToBytes(IC_ROOT_KEY),
        principal: { canisterId },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).cause.code).toBeInstanceOf(LookupErrorCode);
    }
  });
});
