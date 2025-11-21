import { HttpAgent } from '#agent';
import { Ed25519PublicKey } from '../identity/ed25519.ts';
import { PartialIdentity } from './partial.ts';
describe('Partial Identity', () => {
  it('should create a partial identity from a public key', async () => {
    const key = Ed25519PublicKey.fromRaw(new Uint8Array(32).fill(0));
    const partial = new PartialIdentity(key);

    const agent = new HttpAgent({ identity: partial });
    expect((await agent.getPrincipal()).toText()).toBe(
      'deffl-liaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaa',
    );

    const rawKey = partial.rawKey;
    expect(rawKey).toBeDefined();

    const derKey = partial.derKey;
    expect(derKey).toBeDefined();

    const toDer = partial.toDer();
    expect(toDer).toBeDefined();
    expect(toDer).toEqual(derKey);

    const publicKey = partial.getPublicKey();
    expect(publicKey).toBeDefined();
    expect(publicKey).toEqual(key);
  });
  it('should throw an error when attempting to sign', async () => {
    const key = Ed25519PublicKey.fromRaw(new Uint8Array(32).fill(0));
    const partial = new PartialIdentity(key);
    await partial.transformRequest().catch(e => {
      expect(e).toContain('Not implemented.');
    });
  });
});
