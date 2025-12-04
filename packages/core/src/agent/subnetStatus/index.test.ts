import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { Principal } from '#principal';
import { request, Path, lookupSubnetInfo, encodePath, IC_ROOT_SUBNET_ID } from './index.ts';
import { HttpAgent } from '../agent/index.ts';
import * as Cert from '../certificate.ts';
import { goldenCertificates } from '../agent/http/__certificates__/goldenCertificates.ts';
import { decode } from '../cbor.ts';
import { decodeCanisterRanges } from '../certificate.ts';

// bypass bls verification so that an old certificate is accepted
jest.mock('../utils/bls', () => {
  return {
    blsVerify: jest.fn(() => Promise.resolve(true)),
  };
});

jest.useFakeTimers();

const certificateBytes = hexToBytes(goldenCertificates.mainnetApplicationO3ow2);
// Test subnet ID from golden certificate mainnetApplicationO3ow2
const testSubnetId = Principal.fromText(
  'o3ow2-2ipam-6fcjo-3j5vt-fzbge-2g7my-5fz2m-p4o2t-dwlc4-gt2q7-5ae',
);
// Certificate time from mainnetApplicationO3ow2: 2025-11-20T00:07:23.446Z
const certificateTime = Date.parse('2025-11-20T00:07:23.446Z');

// Helper to get status using precomputed certificate
const getStatus = async (paths: Path[], subnetId: Principal = testSubnetId) => {
  jest.setSystemTime(certificateTime);

  const agent = HttpAgent.createSync({ host: 'https://ic0.app' });
  agent.readSubnetState = jest.fn(() => Promise.resolve({ certificate: certificateBytes }));

  return await request({
    subnetId,
    paths,
    agent,
  });
};

describe('Subnet Status utility', () => {
  beforeEach(() => {
    jest.setSystemTime(certificateTime);
  });

  it('should query the time', async () => {
    const status = await getStatus(['time']);
    expect(status.get('time')).toMatchSnapshot();
  });

  it('should query subnet public key', async () => {
    const status = await getStatus(['publicKey']);
    expect(status.get('publicKey')).toMatchSnapshot();
  });

  it('should query subnet node keys', async () => {
    const status = await getStatus(['nodeKeys']);
    const nodeKeys = status.get('nodeKeys');
    expect(nodeKeys).toMatchSnapshot();
  });

  it('should support valid custom paths', async () => {
    const status = await getStatus([
      {
        key: 'time',
        path: [utf8ToBytes('time')],
        decodeStrategy: 'leb128',
      },
    ]);
    const statusRaw = await getStatus([
      {
        key: 'time',
        path: [utf8ToBytes('time')],
        decodeStrategy: 'raw',
      },
    ]);
    const statusHex = await getStatus([
      {
        key: 'time',
        path: [utf8ToBytes('time')],
        decodeStrategy: 'hex',
      },
    ]);
    expect(status.get('time')).toMatchSnapshot();
    expect(statusRaw.get('time')).toMatchSnapshot();
    expect(statusHex.get('time')).toMatchSnapshot();
  });

  it('should support multiple requests', async () => {
    const status = await getStatus(['time', 'publicKey']);
    expect(status.get('time')).toMatchSnapshot();
    expect(status.get('publicKey')).toMatchSnapshot();
  });

  it('should support multiple requests with a failure', async () => {
    // Deliberately requesting a bad value
    const status = await getStatus([
      'time',
      // This arbitrary path should fail
      {
        key: 'asdf',
        path: [utf8ToBytes('asdf')],
        decodeStrategy: 'hex',
      },
    ]);
    expect(status.get('time')).toMatchSnapshot();
    // Expect null for a failed result
    expect(status.get('asdf')).toBe(null);
    // Expect undefined for unset value
    expect(status.get('test123')).toBe(undefined);
  });
});

describe('lookupSubnetInfo', () => {
  it('should return the node keys from a mainnet subnet certificate', async () => {
    jest.setSystemTime(new Date(Date.parse('2025-11-20T00:07:23.446Z')));

    const subnetInfo = lookupSubnetInfo(certificateBytes, testSubnetId);
    expect(subnetInfo.subnetId).toBe(testSubnetId.toText());
    expect(subnetInfo.nodeKeys).toMatchSnapshot();
    expect(subnetInfo.publicKey).toMatchSnapshot();
  });
});

describe('decodeCanisterRanges', () => {
  it('should decode canister ranges correctly', () => {
    const { mainnetApplication } = goldenCertificates;
    const certificate = decode<Cert.Cert>(hexToBytes(mainnetApplication));
    const subnetId = Principal.fromText(
      'uzr34-akd3s-xrdag-3ql62-ocgoh-ld2ao-tamcv-54e7j-krwgb-2gm4z-oqe',
    );

    // Look up the canister ranges from the certificate tree
    const rangesResult = Cert.lookup_subtree(
      ['canister_ranges', subnetId.toUint8Array()],
      certificate.tree,
    );

    if (rangesResult.status !== Cert.LookupSubtreeStatus.Found) {
      throw new Error('Could not find canister ranges');
    }

    const rangesValue = Cert.lookupCanisterRanges({
      subnetId,
      tree: certificate.tree,
      canisterId: Principal.fromText('rdmx6-jaaaa-aaaaa-aaadq-cai'),
    });
    const ranges = decodeCanisterRanges(rangesValue);
    expect(ranges.length).toBeGreaterThan(0);
    // Each range should be a tuple of [start, end] principals
    ranges.forEach(([start, end]) => {
      expect(start).toBeInstanceOf(Principal);
      expect(end).toBeInstanceOf(Principal);
    });
    expect(ranges).toMatchSnapshot();
  });
});

describe('encodePath', () => {
  const subnetId = Principal.fromText(
    'o3ow2-2ipam-6fcjo-3j5vt-fzbge-2g7my-5fz2m-p4o2t-dwlc4-gt2q7-5ae',
  );
  const subnetUint8Array = subnetId.toUint8Array();

  it('should encode time path', () => {
    const encoded = encodePath('time', subnetId);
    expect(encoded).toEqual([utf8ToBytes('time')]);
  });

  it('should encode canisterRanges path', () => {
    const encoded = encodePath('canisterRanges', subnetId);
    expect(encoded).toEqual([utf8ToBytes('canister_ranges'), subnetUint8Array]);
  });

  it('should encode publicKey path', () => {
    const encoded = encodePath('publicKey', subnetId);
    expect(encoded).toEqual([utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('public_key')]);
  });

  it('should encode nodeKeys path', () => {
    const encoded = encodePath('nodeKeys', subnetId);
    expect(encoded).toEqual([utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('node')]);
  });

  it('should encode custom path with array', () => {
    const customPath = {
      key: 'custom',
      path: [utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('custom_field')],
      decodeStrategy: 'raw' as const,
    };
    const encoded = encodePath(customPath, subnetId);
    expect(encoded).toEqual([utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('custom_field')]);
  });

  it('should encode custom path with string', () => {
    const customPath = {
      key: 'custom',
      path: 'custom_field',
      decodeStrategy: 'raw' as const,
    };
    const encoded = encodePath(customPath, subnetId);
    expect(encoded).toEqual([utf8ToBytes('subnet'), subnetUint8Array, utf8ToBytes('custom_field')]);
  });
});

describe('IC_ROOT_SUBNET_ID', () => {
  it('should be the correct root subnet ID', () => {
    expect(IC_ROOT_SUBNET_ID.toText()).toBe(
      'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe',
    );
  });
});
