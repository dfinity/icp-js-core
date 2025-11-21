export type ExpirableMapOptions<K, V> = {
  source?: Iterable<[K, V]>;
  expirationTime?: number;
};

/**
 * A map that expires entries after a given time.
 * Defaults to 10 minutes.
 */
export class ExpirableMap<K, V> implements Map<K, V> {
  // Internals
  #inner: Map<K, { value: V; timestamp: number }>;
  #expirationTime: number;

  [Symbol.iterator]: () => MapIterator<[K, V]> = this.entries.bind(this);
  [Symbol.toStringTag] = 'ExpirableMap';

  /**
   * Create a new ExpirableMap.
   * @param {ExpirableMapOptions<any, any>} options - options for the map.
   * @param {Iterable<[any, any]>} options.source - an optional source of entries to initialize the map with.
   * @param {number} options.expirationTime - the time in milliseconds after which entries will expire.
   */
  constructor(options: ExpirableMapOptions<K, V> = {}) {
    const { source = [], expirationTime = 10 * 60 * 1000 } = options;
    const currentTime = Date.now();
    this.#inner = new Map(
      [...source].map(([key, value]) => [key, { value, timestamp: currentTime }]),
    );
    this.#expirationTime = expirationTime;
  }

  /**
   * Prune removes all expired entries.
   */
  prune() {
    const currentTime = Date.now();
    for (const [key, entry] of this.#inner.entries()) {
      if (currentTime - entry.timestamp > this.#expirationTime) {
        this.#inner.delete(key);
      }
    }
    return this;
  }

  // Implementing the Map interface

  /**
   * Set the value for the given key. Prunes expired entries.
   * @param key for the entry
   * @param value of the entry
   * @returns this
   */
  set(key: K, value: V) {
    this.prune();
    const entry = {
      value,
      timestamp: Date.now(),
    };
    this.#inner.set(key, entry);

    return this;
  }

  /**
   * Get the value associated with the key, if it exists and has not expired.
   * @param key K
   * @returns the value associated with the key, or undefined if the key is not present or has expired.
   */
  get(key: K) {
    const entry = this.#inner.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (Date.now() - entry.timestamp > this.#expirationTime) {
      this.#inner.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this.#inner.clear();
  }

  /**
   * Entries returns the entries of the map, without the expiration time.
   * @returns an iterator over the entries of the map.
   */
  entries(): MapIterator<[K, V]> {
    const iterator = this.#inner.entries();
    const generator = function* () {
      for (const [key, value] of iterator) {
        yield [key, value.value] as [K, V];
      }
      return undefined;
    };
    return generator();
  }

  /**
   * Values returns the values of the map, without the expiration time.
   * @returns an iterator over the values of the map.
   */
  values(): MapIterator<V> {
    const iterator = this.#inner.values();
    const generator = function* () {
      for (const value of iterator) {
        yield value.value;
      }
      return undefined;
    };
    return generator();
  }

  /**
   * Keys returns the keys of the map
   * @returns an iterator over the keys of the map.
   */
  keys(): MapIterator<K> {
    return this.#inner.keys();
  }

  /**
   * forEach calls the callbackfn on each entry of the map.
   * @param callbackfn to call on each entry
   * @param thisArg to use as this when calling the callbackfn
   */
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: ExpirableMap<K, V>) {
    for (const [key, value] of this.#inner.entries()) {
      callbackfn.call(thisArg, value.value, key, this);
    }
  }

  /**
   * has returns true if the key exists and has not expired.
   * @param key K
   * @returns true if the key exists and has not expired.
   */
  has(key: K): boolean {
    return this.#inner.has(key);
  }

  /**
   * delete the entry for the given key.
   * @param key K
   * @returns true if the key existed and has been deleted.
   */
  delete(key: K) {
    return this.#inner.delete(key);
  }

  /**
   * get size of the map.
   * @returns the size of the map.
   */
  get size() {
    return this.#inner.size;
  }
}
