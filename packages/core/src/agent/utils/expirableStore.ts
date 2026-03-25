/**
 * Generic interface for a key-value store with time-based expiration.
 * Keys are strings, values are of type V.
 * Implementations must handle expiration internally.
 */
export interface ExpirableStore<V> {
  /**
   * Time in milliseconds after which entries expire.
   */
  readonly expirationTime: number;

  /**
   * Get the value for a key.
   * Returns undefined if the key is not present or has expired.
   */
  get(key: string): Promise<V | undefined>;

  /**
   * Store a value for a key.
   * Prunes expired entries before inserting.
   */
  set(key: string, value: V): Promise<void>;

  /**
   * Delete the entry for a key.
   */
  delete(key: string): Promise<void>;
}

export interface ExpirableStoreOptions {
  /**
   * Time in milliseconds after which entries expire.
   * Must be a positive finite number.
   */
  expirationTime: number;
}

/**
 * Validates that expirationTime is a positive finite number.
 * @param expirationTime - Time in milliseconds after which entries expire.
 * @throws {Error} if expirationTime is not valid.
 */
export function validateExpirationTime(expirationTime: number): void {
  if (!Number.isFinite(expirationTime) || expirationTime <= 0) {
    throw new Error(`expirationTime must be a positive finite number, got ${expirationTime}`);
  }
}
