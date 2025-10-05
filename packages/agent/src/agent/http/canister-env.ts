import { hexToBytes } from '@noble/hashes/utils';
import { InputError, InvalidRootKeyErrorCode, MissingRootKeyErrorCode } from '../../errors.ts';

const IC_ENV_COOKIE_NAME = 'ic_env';

const ENV_VAR_SEPARATOR = '&';
const ENV_VAR_ASSIGNMENT_SYMBOL = '=';

const IC_ROOT_KEY_VALUE_NAME = 'ic_root_key';
const IC_ROOT_KEY_ENV_NAME = 'IC_ROOT_KEY'; // same as the `CanisterEnv` interface below

const IC_ROOT_KEY_BYTES_LENGTH = 133;

declare global {
  /**
   * The environment variables served by the canister.
   * You can extend the `CanisterEnv` interface to add your own environment variables
   * and have strong typing for them.
   * @example
   * Extend the global `CanisterEnv` interface to add your own environment variables:
   * ```ts
   * // You can also declare the interface in a separate .d.ts file
   * // The `@icp-sdk/bindgen` package has a feature to automatically generate the .d.ts file
   * declare global {
   *   interface CanisterEnv {
   *     readonly ['PUBLIC_CANISTER_ID:backend']: string;
   *   }
   * }
   *
   * const env = getCanisterEnv();
   *
   * console.log(env.IC_ROOT_KEY); // by default served by the canister
   * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ TS passes
   * console.log(env['PUBLIC_CANISTER_ID:frontend']); // ❌ TS will show an error
   * ```
   * @example
   * Alternatively, use the generic parameter to specify additional properties:
   * ```ts
   * const env = getCanisterEnv<{ readonly ['PUBLIC_CANISTER_ID:backend']: string }>();
   *
   * console.log(env.IC_ROOT_KEY); // by default served by the canister
   * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ from generic parameter, TS passes
   * console.log(env['PUBLIC_CANISTER_ID:frontend']); // ❌ TS will show an error
   * ```
   */
  interface CanisterEnv {
    /**
     * The root key of the IC network where the canister is deployed.
     * Served by default by the canister.
     */
    readonly IC_ROOT_KEY: Uint8Array;
  }
}

/**
 * Options for the {@link getCanisterEnv} function
 */
export type GetCanisterEnvOptions = {
  /**
   * The name of the cookie to get the environment variables from.
   * @default 'ic_env'
   */
  cookieName?: string;
};

/**
 * Get the environment variables served by the canister via the cookie.
 *
 * The returned object always includes `IC_ROOT_KEY` property.
 * You can extend the global `CanisterEnv` interface to add your own environment variables
 * and have strong typing for them.
 *
 * In Node.js environment (or any other environment where `globalThis.document` is not available), this function will throw an error.
 * Use {@link safeGetCanisterEnv}, which returns `undefined` in such cases.
 * @param options The options for loading the canister environment variables
 * @returns The environment variables for the canister, always including `IC_ROOT_KEY`
 * @example
 * Extend the global `CanisterEnv` interface to add your own environment variables:
 * ```ts
 * // You can also declare the interface in a separate .d.ts file
 * // The `@icp-sdk/bindgen` package has a feature to automatically generate the .d.ts file
 * declare global {
 *   interface CanisterEnv {
 *     readonly ['PUBLIC_CANISTER_ID:backend']: string;
 *   }
 * }
 *
 * const env = getCanisterEnv();
 *
 * console.log(env.IC_ROOT_KEY); // always available (Uint8Array)
 * console.log(env['PUBLIC_CANISTER_ID:backend']); // ✅ your custom env var, TS passes
 * console.log(env['PUBLIC_CANISTER_ID:frontend']); // ❌ TS will show an error
 * ```
 * @example
 * Alternatively, use the generic parameter to specify additional properties:
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
 */
export function getCanisterEnv<T = Record<string, never>>(
  options: GetCanisterEnvOptions = {},
): (CanisterEnv & T) | undefined {
  const { cookieName = IC_ENV_COOKIE_NAME } = options;

  const encodedEnvVars = getEncodedEnvVarsFromCookie(cookieName);
  if (!encodedEnvVars) {
    return undefined;
  }

  const decodedEnvVars = decodeURIComponent(encodedEnvVars);
  const envVars = getEnvVars<T>(decodedEnvVars);

  return envVars;
}

/**
 * Same as {@link getCanisterEnv} but returns `undefined` if `globalThis.document` is not available.
 * @param options The options for loading the canister environment variables
 * @returns The environment variables for the canister
 * @example
 * ```ts
 * // in a browser environment
 * const env = safeGetCanisterEnv();
 * console.log(env); // { IC_ROOT_KEY: Uint8Array }
 *
 * // in a Node.js environment
 * const env = safeGetCanisterEnv();
 * console.log(env); // undefined
 * ```
 */
export function safeGetCanisterEnv<T = Record<string, never>>(
  options: GetCanisterEnvOptions = {},
): (CanisterEnv & T) | undefined {
  if (!globalThis.document) {
    return undefined;
  }
  return getCanisterEnv<T>(options);
}

function getEncodedEnvVarsFromCookie(cookieName: string): string | undefined {
  return globalThis.document.cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${cookieName}=`))
    ?.split('=')[1]
    .trim();
}

function getEnvVars<T = Record<string, never>>(decoded: string): (CanisterEnv & T) | undefined {
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

  if (entries.length === 0) {
    return undefined;
  }

  const envVars = Object.fromEntries(entries) as CanisterEnv & T;

  if (!envVars.IC_ROOT_KEY) {
    throw InputError.fromCode(new MissingRootKeyErrorCode());
  }

  return envVars;
}
