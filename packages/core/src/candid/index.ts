/**
 * JavaScript and TypeScript module to work with Candid interfaces
 *
 * ## Usage
 *
 * ```ts
 * import { IDL } from '@icp-sdk/core/candid';
 *
 * const MyType = IDL.Record({
 *   name: IDL.Text,
 *   age: IDL.Nat8,
 * });
 *
 * const encoded = IDL.encode([MyType], [{ name: 'John', age: 30 }]);
 * const decoded = IDL.decode([MyType], encoded);
 *
 * console.log(decoded); // [{ name: 'John', age: 30 }]
 * ```
 *
 * <!-- split here -->
 * @module libs/candid/api
 */

export * from './candid-ui.ts';
export * from './candid-core.ts';
export * as IDL from './idl.ts';
export {
  type GenericIdlFuncArgs,
  type GenericIdlFuncRets,
  type GenericIdlServiceFields,
} from './idl.ts';
export * from './utils/hash.ts';
export * from './utils/leb128.ts';
export * from './utils/buffer.ts';
export * from './types.ts';
