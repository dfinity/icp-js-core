/**
 * @experimental
 * @see https://js.icp.build/core/latest/canister-environment
 * @module libs/agent/canister-env/api
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import {
  InputError,
  InvalidRootKeyErrorCode,
  EmptyCookieErrorCode,
  MissingRootKeyErrorCode,
  MissingCookieErrorCode,
  ConflictingCanisterEnvErrorCode,
  MalformedCookieErrorCode,
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
export interface GetCanisterEnvOptions {
  /**
   * The name of the cookie to get the environment variables from.
   * @default 'ic_env'
   */
  cookieName?: string;
}

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
 * @throws {InputError} When no copy of the cookie holds valid URI-encoded content
 * @throws {InputError} When several cookies with that name are present and they disagree
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

  const cookieValues = getCookieValues(cookieName);
  if (cookieValues.length === 0) {
    throw InputError.fromCode(new MissingCookieErrorCode(cookieName));
  }

  // Several cookies with the same name can coexist on one origin, since a cookie is keyed
  // on (name, domain, path) and partitioned cookies live in their own jar. Picking one of
  // them arbitrarily silently configures the app against the wrong network or canister, so
  // only proceed when every copy agrees.
  const decodedValues = cookieValues
    .map(decodeCookieValue)
    .filter((value): value is string => value !== undefined);
  if (decodedValues.length === 0) {
    throw InputError.fromCode(new MalformedCookieErrorCode(cookieName));
  }

  const distinctValues = distinctEnvValues(decodedValues);
  if (distinctValues.length > 1) {
    throw InputError.fromCode(new ConflictingCanisterEnvErrorCode(cookieName, distinctValues));
  }

  const decodedCookieValue = distinctValues[0];
  if (!decodedCookieValue) {
    throw InputError.fromCode(new EmptyCookieErrorCode(cookieName));
  }

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

/**
 * Decode one cookie value, or return `undefined` when its percent-encoding is malformed.
 *
 * A corrupt copy carries no environment, so it is not a candidate to choose between: dropping it
 * lets a valid sibling still be used, rather than having `decodeURIComponent` throw a bare
 * `URIError` out of the whole call.
 * @param value The raw, still-encoded value of a single cookie
 * @returns The decoded value, or `undefined` if it cannot be decoded
 */
function decodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function getCookieValues(cookieName: string): string[] {
  const prefix = `${cookieName}=`;

  return globalThis.document.cookie
    .split(';')
    .map(cookie => cookie.trim())
    .filter(cookie => cookie.startsWith(prefix))
    .map(cookie => cookie.slice(prefix.length).trim());
}

/**
 * Deduplicate cookie values that carry the same environment, keeping the first occurrence of each.
 *
 * Decoding has already normalised the writers' differing percent-encoding (`_` vs `%5F`). What it
 * does not normalise is the order variables are emitted in, which differs between writers too, so
 * compare on a form with the variables sorted rather than on the decoded string itself.
 * @param decodedValues The decoded values of every cookie carrying the environment
 * @returns One value per distinct environment, in the order the browser listed them
 */
function distinctEnvValues(decodedValues: string[]): string[] {
  const byCanonicalForm = new Map<string, string>();

  for (const value of decodedValues) {
    const canonicalForm = canonicalEnvForm(value);
    if (!byCanonicalForm.has(canonicalForm)) {
      byCanonicalForm.set(canonicalForm, value);
    }
  }

  return Array.from(byCanonicalForm.values());
}

/**
 * Render the environment a cookie value resolves to, in a form that is stable across writers.
 *
 * Resolving repeated variables the way {@link parseEnvVars} does — last occurrence wins — before
 * sorting is what makes this reflect the *effective* environment. Sorting the raw variables instead
 * would make `A=1&A=2` and `A=2&A=1` compare equal despite resolving to different values for `A`,
 * which would suppress a genuine conflict.
 * @param decoded The decoded value of a single cookie
 * @returns A canonical rendering of the environment it resolves to
 */
function canonicalEnvForm(decoded: string): string {
  const resolved = new Map(splitEnvVars(decoded));

  return Array.from(resolved, ([key, value]) => `${key}${ENV_VAR_ASSIGNMENT_SYMBOL}${value}`)
    .sort()
    .join(ENV_VAR_SEPARATOR);
}

function splitEnvVars(decoded: string): [string, string][] {
  return decoded.split(ENV_VAR_SEPARATOR).map(v => {
    // we only want to split at the first occurrence of the assignment symbol
    const symbolIndex = v.indexOf(ENV_VAR_ASSIGNMENT_SYMBOL);

    return [v.slice(0, symbolIndex), v.substring(symbolIndex + 1)];
  });
}

function parseEnvVars<T = Record<string, never>>(decoded: string): CanisterEnv & T {
  const entries = splitEnvVars(decoded).map(([key, value]) => {
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
