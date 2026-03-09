import { createExpirableStore } from './createExpirableStore.ts';
import { InMemoryExpirableStore } from './inMemoryExpirableStore.ts';
import { IndexedDBExpirableStore } from './indexedDBExpirableStore.ts';

const DEFAULT_OPTIONS = {
  dbName: 'test-db',
  storeName: 'test-store',
  expirationTime: 5 * 60 * 1000,
};

describe('createExpirableStore', () => {
  it('should return InMemoryExpirableStore when indexedDB is unavailable', () => {
    const store = createExpirableStore(DEFAULT_OPTIONS);
    expect(store).toBeInstanceOf(InMemoryExpirableStore);
  });

  it('should return IndexedDBExpirableStore when indexedDB is available', async () => {
    const { indexedDB } = await import('fake-indexeddb');
    const original = globalThis.indexedDB;
    globalThis.indexedDB = indexedDB;

    try {
      const store = createExpirableStore(DEFAULT_OPTIONS);
      expect(store).toBeInstanceOf(IndexedDBExpirableStore);
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it('should pass expirationTime to the created store', () => {
    const store = createExpirableStore({ ...DEFAULT_OPTIONS, expirationTime: 1000 });
    expect(store.expirationTime).toBe(1000);
  });
});
