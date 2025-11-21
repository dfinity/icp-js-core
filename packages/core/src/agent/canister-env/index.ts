/**
 * @experimental
 * @module canister-env/api
 */

import { hexToBytes } from '@noble/hashes/utils';
import {
  InputError,
  InvalidRootKeyErrorCode,
  EmptyCookieErrorCode,
  MissingRootKeyErrorCode,
  MissingCookieErrorCode,
} from '../errors.ts';

const IC_ENV_COOKIE_NAME = 'ic_env';

const ENV_VAR_SEPARATOR = '&';
const ENV_VAR_ASSIGNMENT_SYMBOL = '=';

const IC_ROOT_KEY_VALUE_NAME = 'ic_root_key';
const IC_ROOT_KEY_ENV_NAME = 'IC_ROOT_KEY'; // the value must be the same as the `CanisterEnv.IC_ROOT_KEY` property name

const IC_ROOT_KEY_BYTES_LENGTH = 133;

/**
 * The environment variables served by the asset canister that hosts the frontend.
 * You can extend the `CanisterEnv` interface to add your own environment variables
 * and have strong typing for them.
 * @see The {@link https://js.icp.build/core/latest/canister-environment/ | Canister Environment Guide} for more details on how to use the canister environment in a frontend application
 * @experimental
 * @example
 * Extend the global `CanisterEnv` interface to add your own environment variables:
 * ```ts title="index.ts"
 * // You can declare the interface to have strong typing
 * // for your own environment variables across your codebase
 * declare module '@icp-sdk/core/agent/canister-env' {
 *   interface CanisterEnv {
 *     readonly ['PUBLIC_CANISTER_ID:backend']: string;
 *     readonly PUBLIC_API_URL: string;
 *   }
 * }
 *
 * const env = getCanisterEnv();
 *
 * console.log(env.IC_ROOT_KEY); // by default served by the asset canister
 * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ TS passes
 * console.log(env.PUBLIC_API_URL); // ✅ TS passes
 * console.log(env['PUBLIC_CANISTER_ID:another']); // ❌ TS will show an error
 * ```
 * @example
 * Alternatively, use the generic parameter to specify additional properties:
 * ```ts title="index.ts"
 * const env = getCanisterEnv<{ readonly ['PUBLIC_CANISTER_ID:backend']: string }>();
 *
 * console.log(env.IC_ROOT_KEY); // by default served by the asset canister
 * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ from generic parameter, TS passes
 * console.log(env['PUBLIC_CANISTER_ID:frontend']); // ❌ TS will show an error
 * ```
 */
export interface CanisterEnv {
  /**
   * The root key of the IC network where the asset canister is deployed.
   * Served by default by the asset canister that hosts the frontend.
   */
  readonly IC_ROOT_KEY: Uint8Array; // the key must be the same as the `IC_ROOT_KEY_ENV_NAME` constant
}

/**
 * Options for the {@link getCanisterEnv} function
 * @experimental
 */
export type GetCanisterEnvOptions = {
  /**
   * The name of the cookie to get the environment variables from.
   * @default 'ic_env'
   */
  cookieName?: string;
};

/**
 * Get the environment variables served by the asset canister via the cookie.
 *
 * The returned object always includes `IC_ROOT_KEY` property.
 * You can extend the global `CanisterEnv` interface to add your own environment variables
 * and have strong typing for them.
 *
 * In Node.js environment (or any other environment where `globalThis.document` is not available), this function will throw an error.
 * Use {@link safeGetCanisterEnv} if you need a function that returns `undefined` instead of throwing errors.
 * @param options The options for loading the canister environment variables
 * @returns The environment variables for the asset canister, always including `IC_ROOT_KEY`
 * @throws {TypeError} When `globalThis.document` is not available
 * @throws {InputError} When the cookie is not found
 * @throws {InputError} When the `IC_ROOT_KEY` is missing or has an invalid length
 * @see The {@link https://js.icp.build/core/latest/canister-environment/ | Canister Environment Guide} for more details on how to use the canister environment in a frontend application
 * @experimental
 * @example
 * ```ts
 * type MyCanisterEnv = {
 *   readonly ['PUBLIC_CANISTER_ID:backend']: string;
 * };
 *
 * const env = getCanisterEnv<MyCanisterEnv>();
 *
 * console.log(env.IC_ROOT_KEY); // always available (Uint8Array)
 * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ from generic parameter, TS passes
 * console.log(env['PUBLIC_CANISTER_ID:frontend']); // ❌ TS will show an error
 * ```
 * Have a look at {@link CanisterEnv} for more details on how to extend the interface
 */
export function getCanisterEnv<T = Record<string, never>>(
  options: GetCanisterEnvOptions = {},
): CanisterEnv & T {
  const { cookieName = IC_ENV_COOKIE_NAME } = options;

  const cookie = getCookie(cookieName);
  if (!cookie) {
    throw InputError.fromCode(new MissingCookieErrorCode(cookieName));
  }

  const cookieValue = cookie.split('=')[1].trim();
  if (!cookieValue) {
    throw InputError.fromCode(new EmptyCookieErrorCode(cookieName));
  }

  const decodedCookieValue = decodeURIComponent(cookieValue);
  const envVars = parseEnvVars<T>(decodedCookieValue);
  if (!envVars.IC_ROOT_KEY) {
    throw InputError.fromCode(new MissingRootKeyErrorCode());
  }

  return envVars;
}

/**
 * Safe version of {@link getCanisterEnv} that returns `undefined` instead of throwing errors.
 * @param options The options for loading the asset canister environment variables
 * @returns The environment variables for the asset canister, or `undefined` if any error occurs
 * @see The {@link https://js.icp.build/core/latest/canister-environment/ | Canister Environment Guide} for more details on how to use the canister environment in a frontend application
 * @experimental
 * @example
 * ```ts
 * // in a browser environment with valid cookie
 * const env = safeGetCanisterEnv();
 * console.log(env); // { IC_ROOT_KEY: Uint8Array, ... }
 *
 * // in a Node.js environment
 * const env = safeGetCanisterEnv();
 * console.log(env); // undefined
 *
 * // in a browser without the environment cookie
 * const env = safeGetCanisterEnv();
 * console.log(env); // undefined
 * ```
 */
export function safeGetCanisterEnv<T = Record<string, never>>(
  options: GetCanisterEnvOptions = {},
): (CanisterEnv & T) | undefined {
  try {
    return getCanisterEnv<T>(options);
  } catch {
    return undefined;
  }
}

function getCookie(cookieName: string): string | undefined {
  return globalThis.document.cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${cookieName}=`));
}

function parseEnvVars<T = Record<string, never>>(decoded: string): CanisterEnv & T {
  const entries = decoded.split(ENV_VAR_SEPARATOR).map(v => {
    // we only want to split at the first occurrence of the assignment symbol
    const symbolIndex = v.indexOf(ENV_VAR_ASSIGNMENT_SYMBOL);

    const key = v.slice(0, symbolIndex);
    const value = v.substring(symbolIndex + 1);

    if (key === IC_ROOT_KEY_VALUE_NAME) {
      const rootKey = hexToBytes(value);
      if (rootKey.length !== IC_ROOT_KEY_BYTES_LENGTH) {
        throw InputError.fromCode(new InvalidRootKeyErrorCode(rootKey, IC_ROOT_KEY_BYTES_LENGTH));
      }
      return [IC_ROOT_KEY_ENV_NAME, rootKey];
    }

    return [key, value];
  });

  return Object.fromEntries(entries);
}
