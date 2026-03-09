import type { ExpirableStore } from './expirableStore.ts';
import { IndexedDBExpirableStore } from './indexedDBExpirableStore.ts';
import { InMemoryExpirableStore } from './inMemoryExpirableStore.ts';

export interface CreateExpirableStoreOptions {
  /**
   * Name of the IndexedDB database (used when IndexedDB is available).
   */
  dbName: string;
  /**
   * Name of the IndexedDB object store (used when IndexedDB is available).
   */
  storeName: string;
  /**
   * Time in milliseconds after which entries expire.
   */
  expirationTime: number;
}

/**
 * Creates an {@link ExpirableStore} with automatic runtime detection.
 * Uses {@link IndexedDBExpirableStore} in browser environments (when IndexedDB is available),
 * falls back to {@link InMemoryExpirableStore} otherwise.
 * @param options - Configuration for the store (dbName, storeName, and expirationTime).
 */
export function createExpirableStore<V>(options: CreateExpirableStoreOptions): ExpirableStore<V> {
  if (typeof globalThis.indexedDB !== 'undefined') {
    return new IndexedDBExpirableStore<V>(options);
  }
  return new InMemoryExpirableStore<V>({ expirationTime: options.expirationTime });
}
