import { validateExpirationTime } from './expirableStore.ts';
import type { ExpirableStore, ExpirableStoreOptions } from './expirableStore.ts';

/**
 * In-memory key-value store with timestamp-based expiration.
 * Prunes all expired entries on every {@link set} call.
 */
export class InMemoryExpirableStore<V> implements ExpirableStore<V> {
  readonly expirationTime: number;
  readonly #entries: Map<string, { value: V; timestamp: number }>;

  constructor(options: ExpirableStoreOptions) {
    validateExpirationTime(options.expirationTime);
    this.expirationTime = options.expirationTime;
    this.#entries = new Map();
  }

  get(key: string): Promise<V | undefined> {
    const entry = this.#entries.get(key);
    if (!entry) {
      return Promise.resolve(undefined);
    }
    if (Date.now() - entry.timestamp > this.expirationTime) {
      this.#entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: V): Promise<void> {
    this.#prune();
    this.#entries.set(key, { value, timestamp: Date.now() });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.#entries.delete(key);
    return Promise.resolve();
  }

  #prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.#entries) {
      if (now - entry.timestamp > this.expirationTime) {
        this.#entries.delete(key);
      }
    }
  }
}
