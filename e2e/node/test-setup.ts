import dotenv from 'dotenv';

dotenv.config();

import { subtle } from 'crypto';
import { expect } from 'vitest';
import { uint8Equals } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';

// make global.crypto writeable
Object.defineProperty(global, 'crypto', {
  writable: true,
  value: { ...global.crypto, subtle },
});

function isPrincipal(value: unknown): value is Principal {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_isPrincipal' in value &&
    value._isPrincipal === true
  );
}

function testPrincipalEquality(a: unknown, b: unknown): boolean | undefined {
  const isPrincipalA = isPrincipal(a);
  const isPrincipalB = isPrincipal(b);

  if (isPrincipalA && isPrincipalB) {
    return a.compareTo(b) === 'eq';
  }

  if (isPrincipalA === isPrincipalB) {
    return undefined;
  }

  return false;
}

function testUint8Equality(a: unknown, b: unknown): boolean | undefined {
  const isUint8ArrayA = a instanceof Uint8Array;
  const isUint8ArrayB = b instanceof Uint8Array;

  if (isUint8ArrayA && isUint8ArrayB) {
    return uint8Equals(a, b);
  }

  if (isUint8ArrayA || isUint8ArrayB) {
    return false;
  }

  return undefined;
}

expect.addEqualityTesters([testPrincipalEquality, testUint8Equality]);

/**
 * Read a required environment variable or throw a descriptive error.
 * @param name The environment variable name.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
