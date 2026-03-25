import { InMemoryExpirableStore } from './inMemoryExpirableStore.ts';

jest.useFakeTimers();

describe('InMemoryExpirableStore', () => {
  it('should return undefined for unknown key', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 5 * 60 * 1000 });
    expect(await store.get('unknown')).toBeUndefined();
  });

  it('should store and retrieve values', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 5 * 60 * 1000 });

    await store.set('key-1', 'value-1');
    expect(await store.get('key-1')).toBe('value-1');
  });

  it('should delete entries', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 5 * 60 * 1000 });

    await store.set('key-1', 'value-1');
    await store.delete('key-1');

    expect(await store.get('key-1')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 1000 });

    await store.set('key-1', 'value-1');
    expect(await store.get('key-1')).toBe('value-1');

    jest.advanceTimersByTime(1001);
    expect(await store.get('key-1')).toBeUndefined();
  });

  it('should prune expired entries on set', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 1000 });

    await store.set('key-1', 'value-1');
    jest.advanceTimersByTime(1001);

    // Setting a new key should prune the expired one
    await store.set('key-2', 'value-2');
    expect(await store.get('key-1')).toBeUndefined();
    expect(await store.get('key-2')).toBe('value-2');
  });

  it.each([0, -1, -Infinity, Infinity, NaN])(
    'should throw for invalid expirationTime: %s',
    expirationTime => {
      expect(() => new InMemoryExpirableStore({ expirationTime })).toThrow(
        'expirationTime must be a positive finite number',
      );
    },
  );

  it('should handle multiple independent entries', async () => {
    const store = new InMemoryExpirableStore({ expirationTime: 5 * 60 * 1000 });

    await store.set('key-1', 'value-1');
    await store.set('key-2', 'value-2');

    expect(await store.get('key-1')).toBe('value-1');
    expect(await store.get('key-2')).toBe('value-2');

    await store.delete('key-1');
    expect(await store.get('key-1')).toBeUndefined();
    expect(await store.get('key-2')).toBe('value-2');
  });
});
