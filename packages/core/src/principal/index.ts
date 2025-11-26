/**
 * JavaScript and TypeScript module to work with Internet Computer Principals.
 *
 * ## Usage
 *
 * ```ts
 * import { Principal } from '@icp-sdk/core/principal';
 *
 * const canisterId = Principal.fromText('uqqxf-5h777-77774-qaaaa-cai');
 * const anonymousPrincipal = Principal.anonymous();
 * ```
 *
 * <!-- split here -->
 * @module libs/principal/api
 */

export * from './principal.ts';
export { getCrc32 } from './utils/getCrc.ts';
export { base32Encode, base32Decode } from './utils/base32.ts';
