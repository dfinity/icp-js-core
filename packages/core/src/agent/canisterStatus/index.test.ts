import { fetchNodeKeys } from './index.ts';
import { Principal } from '#principal';
import * as Cert from '../certificate.ts';
import { hexToBytes } from '@noble/hashes/utils.js';
import { goldenCertificates } from '../agent/http/__certificates__/goldenCertificates.ts';
import { decode } from '../cbor.ts';
import { LookupErrorCode, ProtocolError } from '../errors.ts';

const IC_ROOT_KEY =
  '308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100814' +
  'c0e6ec71fab583b08bd81373c255c3c371b2e84863c98a4f1e08b74235d14fb5d9c0cd546d968' +
  '5f913a0c0b2cc5341583bf4b4392e467db96d65b9bb4cb717112f8472e0d5a4d14505ffd7484' +
  'b01291091c5f87b98883463f98091a0baaae';

// bypass bls verification so that an old certificate is accepted
jest.mock('../utils/bls', () => {
  return {
    blsVerify: jest.fn(() => Promise.resolve(true)),
  };
});

describe('node keys', () => {
  it('should return the node keys from a mainnet application subnet certificate', async () => {
    const { mainnetApplicationLegacy } = goldenCertificates;
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.parse('2023-09-27T19:38:58.129Z')));
    await Cert.Certificate.create({
      certificate: hexToBytes(mainnetApplicationLegacy),
      principal: { canisterId: Principal.fromText('erxue-5aaaa-aaaab-qaagq-cai') },
      rootKey: hexToBytes(IC_ROOT_KEY),
    });

    const nodeKeys = fetchNodeKeys(
      hexToBytes(mainnetApplicationLegacy),
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
      principal: { canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai') },
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
      principal: { canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai') },
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
      principal: { canisterId: Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai') },
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

describe('check_canister_ranges', () => {
  const { mainnetApplication, mainnetApplicationLegacy } = goldenCertificates;
  const certificate = decode<Cert.Cert>(hexToBytes(mainnetApplication));
  const certificateSubnetId = Principal.fromUint8Array(certificate.delegation!.subnet_id);
  const legacyCertificate = decode<Cert.Cert>(hexToBytes(mainnetApplicationLegacy));
  const legacyCertificateSubnetId = Principal.fromUint8Array(
    legacyCertificate.delegation!.subnet_id,
  );

  it.each([
    'rdmx6-jaaaa-aaaaa-aaadq-cai', // first and last element of the first shard
    'uc7f6-kaaaa-aaaaq-qaaaa-cai', // first element of the second shard
    'uf6dk-hyaaa-aaaaq-qaaaq-cai', // inside the second shard
    'ijz7v-ziaaa-aaaaq-7777q-cai', // last element of the second shard
  ])('should return true if the canister is in the range', principal => {
    const canisterId = Principal.fromText(principal);

    const canisterInRange = Cert.check_canister_ranges({
      canisterId,
      subnetId: certificateSubnetId,
      tree: certificate.tree,
    });
    expect(canisterInRange).toBe(true);
  });

  it.each([
    'agp6p-lqaaa-aaaar-aaaaa-cai',
    't4exq-vaaaa-aaaad-aaexq-cai',
    '5vdms-kaaaa-aaaap-aa3uq-cai',
    'erbaw-laaaa-aaaai-acudq-cai',
  ])('should return false if the canister is not in the range', principal => {
    const canisterId = Principal.fromText(principal);

    const canisterInRange = Cert.check_canister_ranges({
      canisterId,
      subnetId: certificateSubnetId,
      tree: certificate.tree,
    });
    expect(canisterInRange).toBe(false);
  });

  it('should throw an error if the subnet is not correct', () => {
    expect.assertions(2);
    try {
      Cert.check_canister_ranges({
        canisterId: Principal.fromText('rdmx6-jaaaa-aaaaa-aaadq-cai'),
        subnetId: Principal.fromText(
          'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe',
        ),
        tree: certificate.tree,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).cause.code).toBeInstanceOf(LookupErrorCode);
    }
  });

  it.each([
    'fs35c-jyaaa-aaaab-qaaaa-cai', // first element of the range
    'erxue-5aaaa-aaaab-qaagq-cai', // inside the range
    'zz5hj-2qaaa-aaaab-7777q-cai', // last element of the range
  ])('should return true when falling back to legacy canister ranges lookup', principal => {
    const canisterId = Principal.fromText(principal);

    const canisterInRange = Cert.check_canister_ranges({
      canisterId,
      subnetId: legacyCertificateSubnetId,
      tree: legacyCertificate.tree,
    });
    expect(canisterInRange).toBe(true);
  });

  it.each([
    'rdmx6-jaaaa-aaaaa-aaadq-cai',
    'yyuf6-eyaaa-aaaad-abu3a-cai',
    'cz757-fiaaa-aaaau-acuaa-cai',
  ])('should return false when falling back to legacy canister ranges lookup', principal => {
    const canisterId = Principal.fromText(principal);

    const canisterInRange = Cert.check_canister_ranges({
      canisterId,
      subnetId: legacyCertificateSubnetId,
      tree: legacyCertificate.tree,
    });
    expect(canisterInRange).toBe(false);
  });

  it('should return false if the subnet is not correct for legacy certificate', () => {
    // all subnets are in legacy certificates
    const canisterInRange = Cert.check_canister_ranges({
      canisterId: Principal.fromText('rdmx6-jaaaa-aaaaa-aaadq-cai'),
      subnetId: legacyCertificateSubnetId,
      tree: legacyCertificate.tree,
    });
    expect(canisterInRange).toBe(false);
  });
});
