import { request, Path, fetchNodeKeys } from './index.ts';
import { Principal } from '#principal';
import { HttpAgent } from '../agent/index.ts';
import * as Cert from '../certificate.ts';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { goldenCertificates } from '../agent/http/__certificates__/goldenCertificates.ts';

const IC_ROOT_KEY =
  '308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100814' +
  'c0e6ec71fab583b08bd81373c255c3c371b2e84863c98a4f1e08b74235d14fb5d9c0cd546d968' +
  '5f913a0c0b2cc5341583bf4b4392e467db96d65b9bb4cb717112f8472e0d5a4d14505ffd7484' +
  'b01291091c5f87b98883463f98091a0baaae';
const testPrincipal = Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');

// bypass bls verification so that an old certificate is accepted
jest.mock('../utils/bls', () => {
  return {
    blsVerify: jest.fn(() => Promise.resolve(true)),
  };
});

jest.useFakeTimers();
const certificateTime = Date.parse('2022-05-19T20:58:22.596Z');
jest.setSystemTime(certificateTime);

// Utils
const canisterBuffer = testPrincipal.toUint8Array();

/* Produced by deploying a dfx new canister and requesting
  | 'time'
  | 'controllers'
  | 'subnet'
  | 'moduleHash'
  | 'candid'
  in dfx 0.10.0
  */
const testCases = [
  {
    certificate:
      'd9d9f7a2647472656583018301830183024863616e697374657283018301820458204c805d47bd74dbcd6c8ce23ebd2e8287c453895165db6b81d93f1daf1b12004683024a0000000000000001010183018301820458205a1ee5770842c74b6749f4d72e3c1b8c0dafdaff48e113d19da4fda687df0636830183024b636f6e74726f6c6c657273820351d9d9f78241044a000000000000000001018302486d657461646174618301830182045820e8071e9c904063629f9ab66d4a447b7a881a964d16757762f424d2ef6c6a776b83024e63616e6469643a736572766963658203584774797065204578616d706c65203d20746578743b0a73657276696365203a207b0a202067726565743a20284578616d706c6529202d3e202874657874292071756572793b0a7d0a820458203676da3cc701ead8143596204d845c31a11d483dccffd5f80e5530660322212883024b6d6f64756c655f6861736882035820896f6c079f96bc3cbef782af1ab1b52847f04700ff916eb49425566995a9a064820458202d41b194a0931a274d874a4de945f104fbcf45de1bb201ec2bbdcb036c21fb0f82045820aa2f527164a8e4d898febf2bc0a8a4f95da58c3b62c6e4185e610e7b40dc615082045820fa572fdf7872444dba23377a8a426906c4314a61ef470df0af1b173b13abe949830182045820ec68f8bfb2a3f70cf8d3d427ff595e6ddb5d4230a8c3ca1d3ccb06e7694fd83283024474696d6582034980f485e1a4a6a7f816697369676e61747572655830adbb57f847e2656f248d3eec467af3c89eb5c63fa8d56bd3a3f48e3f3c570e50d0f824502fc69772d0d637190c52e4e4',
  },
];

// Mocked status using precomputed certificate
const getStatus = async (paths: Path[]) => {
  const agent = new HttpAgent({ host: 'https://ic0.app' });
  agent.readState = jest.fn(() =>
    Promise.resolve({ certificate: hexToBytes(testCases[0].certificate) }),
  );

  return await request({
    canisterId: testPrincipal,
    // Note: subnet is not currently working due to a bug
    paths,
    agent,
  });
};

describe('Canister Status utility', () => {
  it('should query the time', async () => {
    const status = await getStatus(['time']);
    expect(status.get('time')).toMatchSnapshot();
  });
  it('should query canister controllers', async () => {
    const status = await getStatus(['controllers']);
    expect(status.get('controllers')).toMatchSnapshot();
  });
  it('should query canister module hash', async () => {
    const status = await getStatus(['module_hash']);
    expect(status.get('module_hash')).toMatchSnapshot();
  });
  it('should query the candid interface', async () => {
    const status = await getStatus(['candid']);
    expect(status.get('candid')).toMatchSnapshot();
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
    const statusUTF8 = await getStatus([
      {
        kind: 'metadata',
        path: 'candid:service',
        key: 'candid',
        decodeStrategy: 'utf-8',
      },
    ]);
    const statusHex = await getStatus([
      {
        key: 'time',
        path: [utf8ToBytes('time')],
        decodeStrategy: 'hex',
      },
    ]);
    const statusCBOR = await getStatus([
      {
        key: 'Controller',
        path: [utf8ToBytes('canister'), canisterBuffer, utf8ToBytes('controllers')],
        decodeStrategy: 'cbor',
      },
    ]);
    expect(status.get('time')).toMatchSnapshot();
    expect(statusRaw.get('time')).toMatchSnapshot();
    expect(statusUTF8.get('candid')).toMatchSnapshot();
    expect(statusHex.get('time')).toMatchSnapshot();
    expect(statusCBOR.get('Controller')).toMatchSnapshot();
  });
  it('should support valid metadata queries', async () => {
    const status = await getStatus([
      {
        kind: 'metadata',
        path: 'candid:service',
        key: 'candid',
        decodeStrategy: 'hex',
      },
    ]);
    const statusEncoded = await getStatus([
      {
        kind: 'metadata',
        path: utf8ToBytes('candid:service'),
        key: 'candid',
        decodeStrategy: 'hex',
      },
    ]);
    expect(status.get('candid')).toMatchSnapshot();
    expect(statusEncoded.get('candid')).toMatchSnapshot();
  });
  it('should support multiple requests', async () => {
    const status = await getStatus(['time', 'controllers']);
    expect(status.get('time')).toMatchSnapshot();
    expect(status.get('controllers')).toMatchSnapshot();
  });
  it('should support multiple requests with a failure', async () => {
    // Deliberately requesting a bad value
    const consoleSpy = jest.spyOn(console, 'warn');
    const status = await getStatus([
      'time',
      // subnet and this arbitrary path should fail
      'subnet',
      {
        key: 'asdf',
        path: [utf8ToBytes('asdf')],
        decodeStrategy: 'hex',
      },
    ]);
    expect(status.get('time')).toMatchSnapshot();
    // Expect null for a failed result
    expect(status.get('asdf' as unknown as Path)).toBe(null);
    // Expect undefined for unset value
    expect(status.get('test123')).toBe(undefined);
    expect(consoleSpy).toBeCalledTimes(3);
  });
});

describe('node keys', () => {
  it('should return the node keys from a mainnet application subnet certificate', async () => {
    const { mainnetApplication } = goldenCertificates;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.parse('2023-09-27T19:38:58.129Z')));
    await Cert.Certificate.create({
      certificate: hexToBytes(mainnetApplication),
      canisterId: Principal.fromText('erxue-5aaaa-aaaab-qaagq-cai'),
      rootKey: hexToBytes(IC_ROOT_KEY),
    });

    const nodeKeys = fetchNodeKeys(
      hexToBytes(mainnetApplication),
      Principal.fromText('erxue-5aaaa-aaaab-qaagq-cai'),
      hexToBytes(IC_ROOT_KEY),
    );
    expect(nodeKeys).toMatchSnapshot();
  });

  it('should return the node keys from a mainnet system subnet certificate', async () => {
    const { mainnetSystem } = goldenCertificates;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.parse('2023-09-27T19:58:19.412Z')));
    await Cert.Certificate.create({
      certificate: hexToBytes(mainnetSystem),
      canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      rootKey: hexToBytes(IC_ROOT_KEY),
    });

    const nodeKeys = fetchNodeKeys(
      hexToBytes(mainnetSystem),
      Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      hexToBytes(IC_ROOT_KEY),
    );
    expect(nodeKeys).toMatchSnapshot();
  });

  it('should return the node keys from a local application subnet certificate', async () => {
    const { localApplication } = goldenCertificates;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.parse('2023-09-27T20:14:59.406Z')));
    await Cert.Certificate.create({
      certificate: hexToBytes(localApplication),
      canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      rootKey: hexToBytes(IC_ROOT_KEY),
    });

    const nodeKeys = fetchNodeKeys(
      hexToBytes(localApplication),
      Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      hexToBytes(IC_ROOT_KEY),
    );
    expect(nodeKeys).toMatchSnapshot();
  });

  it('should return the node keys from a local system subnet certificate', async () => {
    const { localSystem } = goldenCertificates;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.parse('2023-09-27T20:15:03.406Z')));
    await Cert.Certificate.create({
      certificate: hexToBytes(localSystem),
      canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      rootKey: hexToBytes(IC_ROOT_KEY),
    });

    const nodeKeys = fetchNodeKeys(
      hexToBytes(localSystem),
      Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'),
      hexToBytes(IC_ROOT_KEY),
    );
    expect(nodeKeys).toMatchSnapshot();
  });
});
