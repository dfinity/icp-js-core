import 'fake-indexeddb/auto';
import { IndexedDBExpirableStore } from './indexedDBExpirableStore.ts';

// IndexedDB uses macrotask-based callbacks that don't work with fake timers.
// Restore real timers for this test suite (the agent project enables fake timers globally).
jest.useRealTimers();

const MINUTE_TO_MSECS = 60 * 1_000;
const DEFAULT_TTL = 5 * MINUTE_TO_MSECS;

describe('IndexedDBExpirableStore', () => {
  it('should return undefined for unknown key', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-get-unknown',
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });
    expect(await store.get('unknown')).toBeUndefined();
  });

  it('should store and retrieve values', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-store-retrieve',
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });

    await store.set('key-1', 'value-1');
    await store.set('key-2', 'value-2');

    expect(await store.get('key-1')).toBe('value-1');
    expect(await store.get('key-2')).toBe('value-2');
  });

  it('should delete entries', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-delete',
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });

    await store.set('key-1', 'value-1');
    await store.delete('key-1');

    expect(await store.get('key-1')).toBeUndefined();
  });

  it('should expire entries after TTL', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-expiration',
      storeName: 'entries',
      expirationTime: 1000,
    });

    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);

    try {
      await store.set('key-1', 'value-1');
      expect(await store.get('key-1')).toBeDefined();

      // Advance Date.now past expiration
      spy.mockReturnValue(now + 1001);
      expect(await store.get('key-1')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it.each([0, -1, -Infinity, Infinity, NaN])(
    'should throw for invalid expirationTime: %s',
    expirationTime => {
      expect(
        () =>
          new IndexedDBExpirableStore({
            dbName: 'test-invalid',
            storeName: 'entries',
            expirationTime,
          }),
      ).toThrow('expirationTime must be a positive finite number');
    },
  );

  it('should handle multiple independent entries', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-multiple',
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });

    await store.set('key-1', 'value-1');
    await store.set('key-2', 'value-2');

    expect(await store.get('key-1')).toBe('value-1');
    expect(await store.get('key-2')).toBe('value-2');

    await store.delete('key-1');
    expect(await store.get('key-1')).toBeUndefined();
    expect(await store.get('key-2')).toBe('value-2');
  });

  it('should share data across store instances with same dbName', async () => {
    const dbName = 'test-shared';
    const store1 = new IndexedDBExpirableStore({
      dbName,
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });

    await store1.set('key-1', 'value-1');

    const store2 = new IndexedDBExpirableStore({
      dbName,
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });
    expect(await store2.get('key-1')).toBe('value-1');
  });

  it('should handle different storeNames on the same dbName', async () => {
    const dbName = 'test-multi-store';

    const storeA = new IndexedDBExpirableStore({
      dbName,
      storeName: 'store-a',
      expirationTime: DEFAULT_TTL,
    });
    await storeA.set('key-1', 'value-a');

    // Second store with same dbName but different storeName — triggers version bump
    const storeB = new IndexedDBExpirableStore({
      dbName,
      storeName: 'store-b',
      expirationTime: DEFAULT_TTL,
    });
    await storeB.set('key-1', 'value-b');

    expect(await storeA.get('key-1')).toBe('value-a');
    expect(await storeB.get('key-1')).toBe('value-b');
  });

  it('should throw when IndexedDB is unavailable', () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error -- intentionally removing indexedDB to test guard
    delete globalThis.indexedDB;

    try {
      expect(
        () =>
          new IndexedDBExpirableStore({
            dbName: 'test-no-idb',
            storeName: 'entries',
            expirationTime: DEFAULT_TTL,
          }),
      ).toThrow('IndexedDBExpirableStore requires IndexedDB');
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it('should overwrite existing entries', async () => {
    const store = new IndexedDBExpirableStore({
      dbName: 'test-overwrite',
      storeName: 'entries',
      expirationTime: DEFAULT_TTL,
    });

    await store.set('key-1', 'value-1');
    await store.set('key-1', 'value-2');

    expect(await store.get('key-1')).toBe('value-2');
  });
});
