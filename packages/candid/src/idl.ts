/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Principal as PrincipalId } from '@dfinity/principal';
import { type JsonValue } from './types.ts';
import { concat, PipeArrayBuffer as Pipe, uint8ToDataView } from './utils/buffer.ts';
import { idlLabelToId } from './utils/hash.ts';
import {
  lebDecode,
  lebEncode,
  readIntLE,
  readUIntLE,
  safeRead,
  safeReadUint8,
  slebDecode,
  slebEncode,
  writeIntLE,
  writeUIntLE,
} from './utils/leb128.ts';
import { iexp2 } from './utils/bigint-math.ts';

/**
 * This module provides a combinator library to create serializers/deserializers
 * between JavaScript values and IDL used by canisters on the Internet Computer,
 * as documented at https://github.com/dfinity/candid/blob/119703ba342d2fef6ab4972d2541b9fe36ae8e36/spec/Candid.md
 */

enum IDLTypeIds {
  Null = -1,
  Bool = -2,
  Nat = -3,
  Int = -4,
  Float32 = -13,
  Float64 = -14,
  Text = -15,
  Reserved = -16,
  Empty = -17,
  Opt = -18,
  Vector = -19,
  Record = -20,
  Variant = -21,
  Func = -22,
  Service = -23,
  Principal = -24,
}

const magicNumber = 'DIDL';
const toReadableString_max = 400; // will not display arguments after 400chars. Makes sure 2mb blobs don't get inside the error

function zipWith<TX, TY, TR>(xs: TX[], ys: TY[], f: (a: TX, b: TY) => TR): TR[] {
  return xs.map((x, i) => f(x, ys[i]));
}

/**
 * An IDL Type Table, which precedes the data in the stream.
 */
class TypeTable {
  // List of types. Needs to be an array as the index needs to be stable.
  private _typs: Uint8Array[] = [];
  private _idx = new Map<string, number>();
  private _idxRefCount = new Map<number, number>();

  public has(obj: ConstructType) {
    return this._idx.has(obj.name);
  }

  public add<T>(type: ConstructType<T>, buf: Uint8Array) {
    const idx = this._typs.length;
    this._idx.set(type.name, idx);
    this._idxRefCount.set(idx, 1);
    this._typs.push(buf);
  }

  public merge<T>(obj: ConstructType<T>, knot: string) {
    const idx = this._idx.get(obj.name);
    const knotIdx = this._idx.get(knot);
    if (idx === undefined) {
      throw new Error('Missing type index for ' + obj);
    }
    if (knotIdx === undefined) {
      throw new Error('Missing type index for ' + knot);
    }
    // Point the recursive placeholder (obj) to the concrete type bytes
    this._typs[idx] = this._typs[knotIdx];

    // Merge mappings so BOTH names point to the same index
    // This avoids losing lookups for the concrete type name (e.g. "opt nat8")
    // which may still be referenced elsewhere in the type table build.
    const idxRefCount = this._getIdxRefCount(idx);
    const knotRefCount = this._getIdxRefCount(knotIdx);
    this._idxRefCount.set(idx, idxRefCount + knotRefCount);

    // Re-point the knot name to the resolved index and mark the old index as unused
    this._idx.set(knot, idx);
    this._idxRefCount.set(knotIdx, 0);

    // Remove unused trailing entries if possible
    this._compactFromEnd();
  }

  private _getIdxRefCount(idx: number): number {
    return this._idxRefCount.get(idx) || 0;
  }

  private _compactFromEnd() {
    // Remove unused entries from the end of the array
    while (this._typs.length > 0) {
      const lastIndex = this._typs.length - 1;
      if (this._getIdxRefCount(lastIndex) > 0) {
        break;
      }
      this._typs.pop();
      this._idxRefCount.delete(lastIndex);
    }
  }

  public encode(): Uint8Array {
    const len = lebEncode(this._typs.length);
    const buf = concat(...this._typs);
    return concat(len, buf);
  }

  public indexOf(typeName: string): Uint8Array {
    if (!this._idx.has(typeName)) {
      throw new Error('Missing type index for ' + typeName);
    }
    return slebEncode(this._idx.get(typeName) || 0);
  }
}

export abstract class Visitor<D, R> {
  public visitType<T>(_t: Type<T>, _data: D): R {
    throw new Error('Not implemented');
  }
  public visitPrimitive<T>(t: PrimitiveType<T>, data: D): R {
    return this.visitType(t, data);
  }
  public visitEmpty(t: EmptyClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitBool(t: BoolClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitNull(t: NullClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitReserved(t: ReservedClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitText(t: TextClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitNumber<T>(t: PrimitiveType<T>, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitInt(t: IntClass, data: D): R {
    return this.visitNumber(t, data);
  }
  public visitNat(t: NatClass, data: D): R {
    return this.visitNumber(t, data);
  }
  public visitFloat(t: FloatClass, data: D): R {
    return this.visitPrimitive(t, data);
  }
  public visitFixedInt(t: FixedIntClass, data: D): R {
    return this.visitNumber(t, data);
  }
  public visitFixedNat(t: FixedNatClass, data: D): R {
    return this.visitNumber(t, data);
  }
  public visitPrincipal(t: PrincipalClass, data: D): R {
    return this.visitPrimitive(t, data);
  }

  public visitConstruct<T>(t: ConstructType<T>, data: D): R {
    return this.visitType(t, data);
  }
  public visitVec<T>(t: VecClass<T>, _ty: Type<T>, data: D): R {
    return this.visitConstruct(t, data);
  }
  public visitOpt<T>(t: OptClass<T>, _ty: Type<T>, data: D): R {
    return this.visitConstruct(t, data);
  }
  public visitRecord(t: RecordClass, _fields: Array<[string, Type]>, data: D): R {
    return this.visitConstruct(t, data);
  }
  public visitTuple<T extends any[]>(t: TupleClass<T>, components: Type[], data: D): R {
    const fields: Array<[string, Type]> = components.map((ty, i) => [`_${i}_`, ty]);
    return this.visitRecord(t, fields, data);
  }
  public visitVariant(t: VariantClass, _fields: Array<[string, Type]>, data: D): R {
    return this.visitConstruct(t, data);
  }
  public visitRec<T>(_t: RecClass<T>, ty: ConstructType<T>, data: D): R {
    return this.visitConstruct(ty, data);
  }
  public visitFunc(t: FuncClass, data: D): R {
    return this.visitConstruct(t, data);
  }
  public visitService(t: ServiceClass, data: D): R {
    return this.visitConstruct(t, data);
  }
}

// We try to use hard-to-accidentally-pick names to avoid potential collisions with other types.
enum IdlTypeName {
  EmptyClass = '__IDL_EmptyClass__',
  UnknownClass = '__IDL_UnknownClass__',
  BoolClass = '__IDL_BoolClass__',
  NullClass = '__IDL_NullClass__',
  ReservedClass = '__IDL_ReservedClass__',
  TextClass = '__IDL_TextClass__',
  IntClass = '__IDL_IntClass__',
  NatClass = '__IDL_NatClass__',
  FloatClass = '__IDL_FloatClass__',
  FixedIntClass = '__IDL_FixedIntClass__',
  FixedNatClass = '__IDL_FixedNatClass__',
  VecClass = '__IDL_VecClass__',
  OptClass = '__IDL_OptClass__',
  RecordClass = '__IDL_RecordClass__',
  TupleClass = '__IDL_TupleClass__',
  VariantClass = '__IDL_VariantClass__',
  RecClass = '__IDL_RecClass__',
  PrincipalClass = '__IDL_PrincipalClass__',
  FuncClass = '__IDL_FuncClass__',
  ServiceClass = '__IDL_ServiceClass__',
}

/**
 * Represents an IDL type.
 */
export abstract class Type<T = any> {
  public abstract readonly typeName: IdlTypeName;
  public abstract readonly name: string;
  public abstract accept<D, R>(v: Visitor<D, R>, d: D): R;

  /* Display type name */
  public display(): string {
    return this.name;
  }

  public valueToString(x: T): string {
    return toReadableString(x);
  }

  /* Implement `T` in the IDL spec, only needed for non-primitive types */
  public buildTypeTable(typeTable: TypeTable): void {
    if (!typeTable.has(this)) {
      this._buildTypeTableImpl(typeTable);
    }
  }

  /**
   * Assert that JavaScript's `x` is the proper type represented by this
   * Type.
   */
  public abstract covariant(x: any): x is T;

  /**
   * Encode the value. This needs to be public because it is used by
   * encodeValue() from different types.
   * @internal
   */
  public abstract encodeValue(x: T): Uint8Array;

  /**
   * Implement `I` in the IDL spec.
   * Encode this type for the type table.
   */
  public abstract encodeType(typeTable: TypeTable): Uint8Array;

  public abstract checkType(t: Type): Type;

  public abstract decodeValue(x: Pipe, t: Type): T;

  protected abstract _buildTypeTableImpl(typeTable: TypeTable): void;
}

export abstract class PrimitiveType<T = any> extends Type<T> {
  public checkType(t: Type): Type {
    if (this.name !== t.name) {
      throw new Error(`type mismatch: type on the wire ${t.name}, expect type ${this.name}`);
    }
    return t;
  }

  public _buildTypeTableImpl(_typeTable: TypeTable): void {
    // No type table encoding for Primitive types.
    return;
  }
}

export abstract class ConstructType<T = any> extends Type<T> {
  public checkType(t: Type): ConstructType<T> {
    if (t instanceof RecClass) {
      const ty = t.getType();
      if (typeof ty === 'undefined') {
        throw new Error('type mismatch with uninitialized type');
      }
      return ty;
    }
    throw new Error(`type mismatch: type on the wire ${t.name}, expect type ${this.name}`);
  }
  public encodeType(typeTable: TypeTable) {
    return typeTable.indexOf(this.name);
  }
}

/**
 * Represents an IDL Empty, a type which has no inhabitants.
 * Since no values exist for this type, it cannot be serialised or deserialised.
 * Result types like `Result<Text, Empty>` should always succeed.
 */
export class EmptyClass extends PrimitiveType<never> {
  get typeName() {
    return IdlTypeName.EmptyClass;
  }

  static [Symbol.hasInstance](instance: any): instance is EmptyClass {
    return instance.typeName === IdlTypeName.EmptyClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitEmpty(this, d);
  }

  public covariant(x: any): x is never {
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(): never {
    throw new Error('Empty cannot appear as a function argument');
  }

  public valueToString(): never {
    throw new Error('Empty cannot appear as a value');
  }

  public encodeType() {
    return slebEncode(IDLTypeIds.Empty);
  }

  public decodeValue(): never {
    throw new Error('Empty cannot appear as an output');
  }

  get name() {
    return 'empty';
  }
}

/**
 * Represents an IDL Unknown, a placeholder type for deserialization only.
 * When decoding a value as Unknown, all fields will be retained but the names are only available in
 * hashed form.
 * A deserialized unknown will offer it's actual type by calling the `type()` function.
 * Unknown cannot be serialized and attempting to do so will throw an error.
 */
export class UnknownClass extends Type {
  get typeName() {
    return IdlTypeName.UnknownClass;
  }

  static [Symbol.hasInstance](instance: any): instance is UnknownClass {
    return instance.typeName === IdlTypeName.UnknownClass;
  }

  public checkType(_t: Type): Type {
    throw new Error('Method not implemented for unknown.');
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    throw v.visitType(this, d);
  }

  public covariant(x: any): x is any {
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(): never {
    throw new Error('Unknown cannot appear as a function argument');
  }

  public valueToString(): never {
    throw new Error('Unknown cannot appear as a value');
  }

  public encodeType(): never {
    throw new Error('Unknown cannot be serialized');
  }

  public decodeValue(b: Pipe, t: Type): any {
    let decodedValue = t.decodeValue(b, t);

    if (Object(decodedValue) !== decodedValue) {
      // decodedValue is primitive. Box it, otherwise we cannot add the type() function.
      // The type() function is important for primitives because otherwise we cannot tell apart the
      // different number types.
      decodedValue = Object(decodedValue);
    }

    let typeFunc;
    if (t instanceof RecClass) {
      typeFunc = () => t.getType();
    } else {
      typeFunc = () => t;
    }
    // Do not use 'decodedValue.type = typeFunc' because this would lead to an enumerable property
    // 'type' which means it would be serialized if the value would be candid encoded again.
    // This in turn leads to problems if the decoded value is a variant because these values are
    // only allowed to have a single property.
    Object.defineProperty(decodedValue, 'type', {
      value: typeFunc,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return decodedValue;
  }

  protected _buildTypeTableImpl(): void {
    throw new Error('Unknown cannot be serialized');
  }

  get name() {
    return 'Unknown';
  }
}

/**
 * Represents an IDL Bool
 */
export class BoolClass extends PrimitiveType<boolean> {
  get typeName() {
    return IdlTypeName.BoolClass;
  }

  static [Symbol.hasInstance](instance: any): instance is BoolClass {
    return instance.typeName === IdlTypeName.BoolClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitBool(this, d);
  }

  public covariant(x: any): x is boolean {
    if (typeof x === 'boolean') return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: boolean): Uint8Array {
    return new Uint8Array([x ? 1 : 0]);
  }

  public encodeType(): Uint8Array {
    return slebEncode(IDLTypeIds.Bool);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    switch (safeReadUint8(b)) {
      case 0:
        return false;
      case 1:
        return true;
      default:
        throw new Error('Boolean value out of range');
    }
  }

  get name() {
    return 'bool';
  }
}

/**
 * Represents an IDL Null
 */
export class NullClass extends PrimitiveType<null> {
  get typeName() {
    return IdlTypeName.NullClass;
  }

  static [Symbol.hasInstance](instance: any): instance is NullClass {
    return instance.typeName === IdlTypeName.NullClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitNull(this, d);
  }

  public covariant(x: any): x is null {
    if (x === null) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(): Uint8Array {
    return new Uint8Array(0);
  }

  public encodeType(): Uint8Array {
    return slebEncode(IDLTypeIds.Null);
  }

  public decodeValue(_b: Pipe, t: Type) {
    this.checkType(t);
    return null;
  }

  get name() {
    return 'null';
  }
}

/**
 * Represents an IDL Reserved
 */
export class ReservedClass extends PrimitiveType<any> {
  get typeName() {
    return IdlTypeName.ReservedClass;
  }

  static [Symbol.hasInstance](instance: any): instance is ReservedClass {
    return instance.typeName === IdlTypeName.ReservedClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitReserved(this, d);
  }

  public covariant(_x: any): _x is any {
    return true;
  }

  public encodeValue(): Uint8Array {
    return new Uint8Array(0);
  }

  public encodeType(): Uint8Array {
    return slebEncode(IDLTypeIds.Reserved);
  }

  public decodeValue(b: Pipe, t: Type) {
    if (t.name !== this.name) {
      t.decodeValue(b, t);
    }
    return null;
  }

  get name() {
    return 'reserved';
  }
}

/**
 * Represents an IDL Text
 */
export class TextClass extends PrimitiveType<string> {
  get typeName() {
    return IdlTypeName.TextClass;
  }

  static [Symbol.hasInstance](instance: any): instance is TextClass {
    return instance.typeName === IdlTypeName.TextClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitText(this, d);
  }

  public covariant(x: any): x is string {
    if (typeof x === 'string') return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: string) {
    const buf = new TextEncoder().encode(x);
    const len = lebEncode(buf.byteLength);
    return concat(len, buf);
  }

  public encodeType() {
    return slebEncode(IDLTypeIds.Text);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    const len = lebDecode(b);
    const buf = safeRead(b, Number(len));
    const decoder = new TextDecoder('utf8', { fatal: true });
    return decoder.decode(buf);
  }

  get name() {
    return 'text';
  }

  public valueToString(x: string) {
    return '"' + x + '"';
  }
}

/**
 * Represents an IDL Int
 */
export class IntClass extends PrimitiveType<bigint> {
  get typeName() {
    return IdlTypeName.IntClass;
  }

  static [Symbol.hasInstance](instance: any): instance is IntClass {
    return instance.typeName === IdlTypeName.IntClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitInt(this, d);
  }

  public covariant(x: any): x is bigint {
    // We allow encoding of JavaScript plain numbers.
    // But we will always decode to bigint.
    if (typeof x === 'bigint' || Number.isInteger(x)) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: bigint | number): Uint8Array {
    return slebEncode(x);
  }

  public encodeType() {
    return slebEncode(IDLTypeIds.Int);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    return slebDecode(b);
  }

  get name() {
    return 'int';
  }

  public valueToString(x: bigint) {
    return x.toString();
  }
}

/**
 * Represents an IDL Nat
 */
export class NatClass extends PrimitiveType<bigint> {
  get typeName() {
    return IdlTypeName.NatClass;
  }

  static [Symbol.hasInstance](instance: any): instance is NatClass {
    return instance.typeName === IdlTypeName.NatClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitNat(this, d);
  }

  public covariant(x: any): x is bigint {
    // We allow encoding of JavaScript plain numbers.
    // But we will always decode to bigint.
    if ((typeof x === 'bigint' && x >= BigInt(0)) || (Number.isInteger(x) && x >= 0)) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: bigint | number): Uint8Array {
    return lebEncode(x);
  }

  public encodeType() {
    return slebEncode(IDLTypeIds.Nat);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    return lebDecode(b);
  }

  get name() {
    return 'nat';
  }

  public valueToString(x: bigint) {
    return x.toString();
  }
}

/**
 * Represents an IDL Float
 */
export class FloatClass extends PrimitiveType<number> {
  get typeName() {
    return IdlTypeName.FloatClass;
  }

  static [Symbol.hasInstance](instance: any): instance is FloatClass {
    return instance.typeName === IdlTypeName.FloatClass;
  }

  constructor(public readonly _bits: number) {
    super();
    if (_bits !== 32 && _bits !== 64) {
      throw new Error('not a valid float type');
    }
  }
  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitFloat(this, d);
  }

  public covariant(x: any): x is number {
    if (typeof x === 'number' || x instanceof Number) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: number) {
    const buf = new ArrayBuffer(this._bits / 8);
    const view = new DataView(buf);
    if (this._bits === 32) {
      view.setFloat32(0, x, true);
    } else {
      view.setFloat64(0, x, true);
    }
    return new Uint8Array(buf);
  }

  public encodeType(): Uint8Array {
    const opcode = this._bits === 32 ? IDLTypeIds.Float32 : IDLTypeIds.Float64;
    return slebEncode(opcode);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    const bytes = safeRead(b, this._bits / 8);
    const view = uint8ToDataView(bytes);
    if (this._bits === 32) {
      return view.getFloat32(0, true);
    } else {
      return view.getFloat64(0, true);
    }
  }

  get name() {
    return 'float' + this._bits;
  }

  public valueToString(x: number) {
    return x.toString();
  }
}

/**
 * Represents an IDL fixed-width Int(n)
 */
export class FixedIntClass extends PrimitiveType<bigint | number> {
  get typeName() {
    return IdlTypeName.FixedIntClass;
  }

  static [Symbol.hasInstance](instance: any): instance is FixedIntClass {
    return instance.typeName === IdlTypeName.FixedIntClass;
  }

  constructor(public readonly _bits: number) {
    super();
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitFixedInt(this, d);
  }

  public covariant(x: any): x is bigint {
    const min = iexp2(this._bits - 1) * BigInt(-1);
    const max = iexp2(this._bits - 1) - BigInt(1);
    let ok = false;
    if (typeof x === 'bigint') {
      ok = x >= min && x <= max;
    } else if (Number.isInteger(x)) {
      const v = BigInt(x);
      ok = v >= min && v <= max;
    } else {
      ok = false;
    }

    if (ok) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: bigint | number) {
    return writeIntLE(x, this._bits / 8);
  }

  public encodeType() {
    const offset = Math.log2(this._bits) - 3;
    return slebEncode(-9 - offset);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    const num = readIntLE(b, this._bits / 8);
    if (this._bits <= 32) {
      return Number(num);
    } else {
      return num;
    }
  }

  get name() {
    return `int${this._bits}`;
  }

  public valueToString(x: bigint | number) {
    return x.toString();
  }
}

/**
 * Represents an IDL fixed-width Nat(n)
 */
export class FixedNatClass extends PrimitiveType<bigint | number> {
  get typeName() {
    return IdlTypeName.FixedNatClass;
  }

  static [Symbol.hasInstance](instance: any): instance is FixedNatClass {
    return instance.typeName === IdlTypeName.FixedNatClass;
  }

  constructor(public readonly _bits: number) {
    super();
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitFixedNat(this, d);
  }

  public covariant(x: any): x is bigint {
    const max = iexp2(this._bits);
    let ok = false;
    if (typeof x === 'bigint' && x >= BigInt(0)) {
      ok = x < max;
    } else if (Number.isInteger(x) && x >= 0) {
      const v = BigInt(x);
      ok = v < max;
    } else {
      ok = false;
    }
    if (ok) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: bigint | number) {
    return writeUIntLE(x, this._bits / 8);
  }

  public encodeType() {
    const offset = Math.log2(this._bits) - 3;
    return slebEncode(-5 - offset);
  }

  public decodeValue(b: Pipe, t: Type) {
    this.checkType(t);
    const num = readUIntLE(b, this._bits / 8);
    if (this._bits <= 32) {
      return Number(num);
    } else {
      return num;
    }
  }

  get name() {
    return `nat${this._bits}`;
  }

  public valueToString(x: bigint | number) {
    return x.toString();
  }
}

/**
 * Represents an IDL Array
 *
 * Arrays of fixed-sized nat/int type (e.g. nat8), are encoded from and decoded to TypedArrays (e.g. Uint8Array).
 * Arrays of float or other non-primitive types are encoded/decoded as untyped array in Javascript.
 * @param {Type} t
 */
export class VecClass<T> extends ConstructType<T[]> {
  get typeName() {
    return IdlTypeName.VecClass;
  }

  static [Symbol.hasInstance]<T>(instance: any): instance is VecClass<T> {
    return instance.typeName === IdlTypeName.VecClass;
  }

  // If true, this vector is really a blob and we can just use memcpy.
  //
  // NOTE:
  // With support of encoding/dencoding of TypedArrays, this optimization is
  // only used when plain array of bytes are passed as encoding input in order
  // to be backward compatible.
  private _blobOptimization = false;

  constructor(public _type: Type<T>) {
    super();
    if (_type instanceof FixedNatClass && _type._bits === 8) {
      this._blobOptimization = true;
    }
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitVec(this, this._type, d);
  }

  public covariant(x: any): x is T[] {
    // Special case for ArrayBuffer
    const bits =
      this._type instanceof FixedNatClass
        ? this._type._bits
        : this._type instanceof FixedIntClass
          ? this._type._bits
          : 0;

    if (
      (ArrayBuffer.isView(x) && bits == (x as any).BYTES_PER_ELEMENT * 8) ||
      (Array.isArray(x) &&
        x.every((v, idx) => {
          try {
            return this._type.covariant(v);
          } catch (e: any) {
            throw new Error(`Invalid ${this.display()} argument: \n\nindex ${idx} -> ${e.message}`);
          }
        }))
    )
      return true;

    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: T[]): Uint8Array {
    const len = lebEncode(x.length);
    if (this._blobOptimization) {
      return concat(len, new Uint8Array(x as unknown as number[]));
    }

    if (ArrayBuffer.isView(x)) {
      // Handle TypedArrays with endianness concerns
      if (x instanceof Int16Array || x instanceof Uint16Array) {
        const buffer = new DataView(new ArrayBuffer(x.length * 2));
        for (let i = 0; i < x.length; i++) {
          if (x instanceof Int16Array) {
            buffer.setInt16(i * 2, x[i], true); // true = little-endian
          } else {
            buffer.setUint16(i * 2, x[i], true);
          }
        }
        return concat(len, new Uint8Array(buffer.buffer));
      } else if (x instanceof Int32Array || x instanceof Uint32Array) {
        const buffer = new DataView(new ArrayBuffer(x.length * 4));
        for (let i = 0; i < x.length; i++) {
          if (x instanceof Int32Array) {
            buffer.setInt32(i * 4, x[i], true);
          } else {
            buffer.setUint32(i * 4, x[i], true);
          }
        }
        return concat(len, new Uint8Array(buffer.buffer));
      } else if (x instanceof BigInt64Array || x instanceof BigUint64Array) {
        const buffer = new DataView(new ArrayBuffer(x.length * 8));
        for (let i = 0; i < x.length; i++) {
          if (x instanceof BigInt64Array) {
            buffer.setBigInt64(i * 8, x[i], true);
          } else {
            buffer.setBigUint64(i * 8, x[i], true);
          }
        }
        return concat(len, new Uint8Array(buffer.buffer));
      } else {
        // For Uint8Array, Int8Array, etc. that don't have endianness concerns
        return concat(len, new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
      }
    }
    const buf = new Pipe(new Uint8Array(len.byteLength + x.length), 0);
    buf.write(len);
    for (const d of x) {
      const encoded = this._type.encodeValue(d);
      buf.write(new Uint8Array(encoded));
    }
    return buf.buffer;
  }

  public _buildTypeTableImpl(typeTable: TypeTable) {
    this._type.buildTypeTable(typeTable);

    const opCode = slebEncode(IDLTypeIds.Vector);
    const buffer = this._type.encodeType(typeTable);
    typeTable.add(this, concat(opCode, buffer));
  }

  public decodeValue(b: Pipe, t: Type): T[] {
    const vec = this.checkType(t);
    if (!(vec instanceof VecClass)) {
      throw new Error('Not a vector type');
    }
    const len = Number(lebDecode(b));

    if (this._type instanceof FixedNatClass) {
      if (this._type._bits == 8) {
        return new Uint8Array(b.read(len)) as unknown as T[];
      }
      if (this._type._bits == 16) {
        const bytes = b.read(len * 2);
        // Check if we need to swap bytes for endianness
        const u16 = new Uint16Array(bytes.buffer, bytes.byteOffset, len);
        return u16 as unknown as T[];
      }
      if (this._type._bits == 32) {
        const bytes = b.read(len * 4);
        const u32 = new Uint32Array(bytes.buffer, bytes.byteOffset, len);
        return u32 as unknown as T[];
      }
      if (this._type._bits == 64) {
        return new BigUint64Array(b.read(len * 8).buffer) as unknown as T[];
      }
    }

    if (this._type instanceof FixedIntClass) {
      if (this._type._bits == 8) {
        return new Int8Array(b.read(len)) as unknown as T[];
      }
      if (this._type._bits == 16) {
        const bytes = b.read(len * 2);
        // Create a DataView to properly handle endianness
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        // Create result array with correct endianness
        const result = new Int16Array(len);
        for (let i = 0; i < len; i++) {
          // Read each value as little-endian (Candid wire format is little-endian)
          result[i] = view.getInt16(i * 2, true);
        }
        return result as unknown as T[];
      }
      if (this._type._bits == 32) {
        const bytes = b.read(len * 4);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        const result = new Int32Array(len);
        for (let i = 0; i < len; i++) {
          result[i] = view.getInt32(i * 4, true);
        }
        return result as unknown as T[];
      }
      if (this._type._bits == 64) {
        const bytes = b.read(len * 8);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        const result = new BigInt64Array(len);
        for (let i = 0; i < len; i++) {
          result[i] = view.getBigInt64(i * 8, true);
        }
        return result as unknown as T[];
      }
    }

    const rets: T[] = [];
    for (let i = 0; i < len; i++) {
      rets.push(this._type.decodeValue(b, vec._type));
    }
    return rets;
  }

  get name() {
    return `vec ${this._type.name}`;
  }

  public display() {
    return `vec ${this._type.display()}`;
  }

  public valueToString(x: T[]) {
    const elements = x.map(e => this._type.valueToString(e));
    return 'vec {' + elements.join('; ') + '}';
  }
}

/**
 * Represents an IDL Option
 * @param {Type} t
 */
export class OptClass<T> extends ConstructType<[T] | []> {
  get typeName() {
    return IdlTypeName.OptClass;
  }

  static [Symbol.hasInstance]<T>(instance: any): instance is OptClass<T> {
    return instance.typeName === IdlTypeName.OptClass;
  }

  constructor(public _type: Type<T>) {
    super();
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitOpt(this, this._type, d);
  }

  public covariant(x: any): x is [T] | [] {
    try {
      if (Array.isArray(x) && (x.length === 0 || (x.length === 1 && this._type.covariant(x[0]))))
        return true;
    } catch (e: any) {
      throw new Error(
        `Invalid ${this.display()} argument: ${toReadableString(x)} \n\n-> ${e.message}`,
      );
    }
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: [T] | []): Uint8Array {
    if (x.length === 0) {
      return new Uint8Array([0]);
    } else {
      return concat(new Uint8Array([1]), this._type.encodeValue(x[0]));
    }
  }

  public _buildTypeTableImpl(typeTable: TypeTable) {
    this._type.buildTypeTable(typeTable);

    const opCode = slebEncode(IDLTypeIds.Opt);
    const buffer = this._type.encodeType(typeTable);
    typeTable.add(this, concat(opCode, buffer));
  }

  public decodeValue(b: Pipe, t: Type): [T] | [] {
    if (t instanceof NullClass) {
      return [];
    }

    if (t instanceof ReservedClass) {
      return [];
    }

    let wireType = t;
    // unfold wireType, if needed
    if (t instanceof RecClass) {
      const ty = t.getType();
      if (typeof ty === 'undefined') {
        throw new Error('type mismatch with uninitialized type');
      } else wireType = ty;
    }

    if (wireType instanceof OptClass) {
      switch (safeReadUint8(b)) {
        case 0:
          return [];
        case 1: {
          // Save the current state of the Pipe `b` to allow rollback in case of an error
          const checkpoint = b.save();
          try {
            // Attempt to decode a value using the `_type` of the current instance
            const v = this._type.decodeValue(b, wireType._type);
            return [v];
          } catch (e: any) {
            // If an error occurs during decoding, restore the Pipe `b` to its previous state
            b.restore(checkpoint);
            // Skip the value at the current wire type to advance the Pipe `b` position
            wireType._type.decodeValue(b, wireType._type);
            // Return an empty array to indicate a `none` value
            return [];
          }
        }
        default:
          throw new Error('Not an option value');
      }
    } else if (
      // this check corresponds to `not (null <: <t>)` in the spec
      this._type instanceof NullClass ||
      this._type instanceof OptClass ||
      this._type instanceof ReservedClass
    ) {
      // null <: <t> :
      // skip value at wire type (to advance b) and return "null", i.e. []
      wireType.decodeValue(b, wireType);
      return [];
    } else {
      // not (null <: t) :
      // try constituent type
      const checkpoint = b.save();
      try {
        const v = this._type.decodeValue(b, t);
        return [v];
      } catch (e: any) {
        // decoding failed, but this is opt, so return "null", i.e. []
        b.restore(checkpoint);
        // skip value at wire type (to advance b)
        wireType.decodeValue(b, t);
        // return "null"
        return [];
      }
    }
  }

  get name() {
    return `opt ${this._type.name}`;
  }

  public display() {
    return `opt ${this._type.display()}`;
  }

  public valueToString(x: [T] | []) {
    if (x.length === 0) {
      return 'null';
    } else {
      return `opt ${this._type.valueToString(x[0])}`;
    }
  }
}

/**
 * Represents an IDL Record
 * @param {object} [fields] - mapping of function name to Type
 */
export class RecordClass extends ConstructType<Record<string, any>> {
  get typeName() {
    return IdlTypeName.RecordClass;
  }

  static [Symbol.hasInstance](instance: any): instance is RecordClass {
    // TupleClass extends RecordClass, so we need to check both here
    return (
      instance.typeName === IdlTypeName.RecordClass || instance.typeName === IdlTypeName.TupleClass
    );
  }

  public readonly _fields: Array<[string, Type]>;

  constructor(fields: Record<string, Type> = {}) {
    super();
    this._fields = Object.entries(fields).sort((a, b) => idlLabelToId(a[0]) - idlLabelToId(b[0]));
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitRecord(this, this._fields, d);
  }

  public tryAsTuple(): Type[] | null {
    const res: Type[] = [];
    for (let i = 0; i < this._fields.length; i++) {
      const [key, type] = this._fields[i];
      if (key !== `_${i}_`) {
        return null;
      }
      res.push(type);
    }
    return res;
  }

  public covariant(x: any): x is Record<string, any> {
    if (
      typeof x === 'object' &&
      this._fields.every(([k, t]) => {
        // eslint-disable-next-line
        if (!x.hasOwnProperty(k)) {
          throw new Error(`Record is missing key "${k}".`);
        }
        try {
          return t.covariant(x[k]);
        } catch (e: any) {
          throw new Error(`Invalid ${this.display()} argument: \n\nfield ${k} -> ${e.message}`);
        }
      })
    )
      return true;

    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: Record<string, any>): Uint8Array {
    const values = this._fields.map(([key]) => x[key]);
    const bufs = zipWith(this._fields, values, ([, c], d) => c.encodeValue(d));
    return concat(...bufs);
  }

  public _buildTypeTableImpl(T: TypeTable) {
    this._fields.forEach(([_, value]) => value.buildTypeTable(T));
    const opCode = slebEncode(IDLTypeIds.Record);
    const len = lebEncode(this._fields.length);
    const fields = this._fields.map(([key, value]) =>
      concat(lebEncode(idlLabelToId(key)), value.encodeType(T)),
    );

    T.add(this, concat(opCode, len, concat(...fields)));
  }

  public decodeValue(b: Pipe, t: Type) {
    const record = this.checkType(t);
    if (!(record instanceof RecordClass)) {
      throw new Error('Not a record type');
    }
    const x: Record<string, any> = {};

    let expectedRecordIdx = 0;
    let actualRecordIdx = 0;
    while (actualRecordIdx < record._fields.length) {
      const [hash, type] = record._fields[actualRecordIdx];

      if (expectedRecordIdx >= this._fields.length) {
        // skip unexpected left over fields present on the wire
        type.decodeValue(b, type);
        actualRecordIdx++;
        continue;
      }

      const [expectKey, expectType] = this._fields[expectedRecordIdx];
      const expectedId = idlLabelToId(this._fields[expectedRecordIdx][0]);
      const actualId = idlLabelToId(hash);
      if (expectedId === actualId) {
        // the current field on the wire matches the expected field
        x[expectKey] = expectType.decodeValue(b, type);
        expectedRecordIdx++;
        actualRecordIdx++;
      } else if (actualId > expectedId) {
        // The expected field does not exist on the wire
        if (expectType instanceof OptClass || expectType instanceof ReservedClass) {
          x[expectKey] = [];
          expectedRecordIdx++;
        } else {
          throw new Error('Cannot find required field ' + expectKey);
        }
      } else {
        // The field on the wire does not exist in the output type, so we can skip it
        type.decodeValue(b, type);
        actualRecordIdx++;
      }
    }

    // initialize left over expected optional fields
    for (const [expectKey, expectType] of this._fields.slice(expectedRecordIdx)) {
      if (expectType instanceof OptClass || expectType instanceof ReservedClass) {
        // TODO this assumes null value in opt is represented as []
        x[expectKey] = [];
      } else {
        throw new Error('Cannot find required field ' + expectKey);
      }
    }
    return x;
  }

  get fieldsAsObject(): Record<number, Type> {
    const fields: Record<number, Type> = {};
    for (const [name, ty] of this._fields) {
      fields[idlLabelToId(name)] = ty;
    }
    return fields;
  }

  get name() {
    const fields = this._fields.map(([key, value]) => key + ':' + value.name);
    return `record {${fields.join('; ')}}`;
  }

  public display() {
    const fields = this._fields.map(([key, value]) => key + ':' + value.display());
    return `record {${fields.join('; ')}}`;
  }

  public valueToString(x: Record<string, any>) {
    const values = this._fields.map(([key]) => x[key]);
    const fields = zipWith(this._fields, values, ([k, c], d) => k + '=' + c.valueToString(d));
    return `record {${fields.join('; ')}}`;
  }
}

/**
 * Represents Tuple, a syntactic sugar for Record.
 * @param {Type} components
 */
export class TupleClass<T extends any[]> extends RecordClass {
  get typeName() {
    return IdlTypeName.TupleClass;
  }

  static [Symbol.hasInstance]<T extends any[]>(instance: any): instance is TupleClass<T> {
    return instance.typeName === IdlTypeName.TupleClass;
  }

  protected readonly _components: Type[];

  constructor(_components: Type[]) {
    const x: Record<string, any> = {};
    _components.forEach((e, i) => (x['_' + i + '_'] = e));
    super(x);
    this._components = _components;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitTuple(this, this._components, d);
  }

  public covariant(x: any): x is T {
    // `>=` because tuples can be covariant when encoded.

    if (
      Array.isArray(x) &&
      x.length >= this._fields.length &&
      this._components.every((t, i) => {
        try {
          return t.covariant(x[i]);
        } catch (e: any) {
          throw new Error(`Invalid ${this.display()} argument: \n\nindex ${i} -> ${e.message}`);
        }
      })
    )
      return true;

    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: any[]): Uint8Array {
    const bufs = zipWith(this._components, x, (c, d) => c.encodeValue(d));
    return concat(...bufs);
  }

  public decodeValue(b: Pipe, t: Type): T {
    const tuple = this.checkType(t);
    if (!(tuple instanceof TupleClass)) {
      throw new Error('not a tuple type');
    }
    if (tuple._components.length < this._components.length) {
      throw new Error('tuple mismatch');
    }
    const res = [];
    for (const [i, wireType] of tuple._components.entries()) {
      if (i >= this._components.length) {
        // skip value
        wireType.decodeValue(b, wireType);
      } else {
        res.push(this._components[i].decodeValue(b, wireType));
      }
    }
    return res as T;
  }

  public display() {
    const fields = this._components.map(value => value.display());
    return `record {${fields.join('; ')}}`;
  }

  public valueToString(values: any[]) {
    const fields = zipWith(this._components, values, (c, d) => c.valueToString(d));
    return `record {${fields.join('; ')}}`;
  }
}

/**
 * Represents an IDL Variant
 * @param {object} [fields] - mapping of function name to Type
 */
export class VariantClass extends ConstructType<Record<string, any>> {
  get typeName() {
    return IdlTypeName.VariantClass;
  }

  static [Symbol.hasInstance](instance: any): instance is VariantClass {
    return instance.typeName === IdlTypeName.VariantClass;
  }

  public readonly _fields: Array<[string, Type]>;

  constructor(fields: Record<string, Type> = {}) {
    super();
    this._fields = Object.entries(fields).sort((a, b) => idlLabelToId(a[0]) - idlLabelToId(b[0]));
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitVariant(this, this._fields, d);
  }

  public covariant(x: any): x is Record<string, any> {
    if (
      typeof x === 'object' &&
      Object.entries(x).length === 1 &&
      this._fields.every(([k, v]) => {
        try {
          // eslint-disable-next-line
          return !x.hasOwnProperty(k) || v.covariant(x[k]);
        } catch (e: any) {
          throw new Error(`Invalid ${this.display()} argument: \n\nvariant ${k} -> ${e.message}`);
        }
      })
    )
      return true;

    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: Record<string, any>) {
    for (let i = 0; i < this._fields.length; i++) {
      const [name, type] = this._fields[i];
      // eslint-disable-next-line
      if (x.hasOwnProperty(name)) {
        const idx = lebEncode(i);
        const buf = type.encodeValue(x[name]);

        return concat(idx, buf);
      }
    }
    throw Error('Variant has no data: ' + x);
  }

  public _buildTypeTableImpl(typeTable: TypeTable) {
    this._fields.forEach(([, type]) => {
      type.buildTypeTable(typeTable);
    });
    const opCode = slebEncode(IDLTypeIds.Variant);
    const len = lebEncode(this._fields.length);
    const fields = this._fields.map(([key, value]) =>
      concat(lebEncode(idlLabelToId(key)), value.encodeType(typeTable)),
    );
    typeTable.add(this, concat(opCode, len, ...fields));
  }

  public decodeValue(b: Pipe, t: Type) {
    const variant = this.checkType(t);
    if (!(variant instanceof VariantClass)) {
      throw new Error('Not a variant type');
    }
    const idx = Number(lebDecode(b));
    if (idx >= variant._fields.length) {
      throw Error('Invalid variant index: ' + idx);
    }
    const [wireHash, wireType] = variant._fields[idx];
    for (const [key, expectType] of this._fields) {
      if (idlLabelToId(wireHash) === idlLabelToId(key)) {
        const value = expectType.decodeValue(b, wireType);
        return { [key]: value };
      }
    }
    throw new Error('Cannot find field hash ' + wireHash);
  }

  get name() {
    const fields = this._fields.map(([key, type]) => key + ':' + type.name);
    return `variant {${fields.join('; ')}}`;
  }

  public display() {
    const fields = this._fields.map(
      ([key, type]) => key + (type.name === 'null' ? '' : `:${type.display()}`),
    );
    return `variant {${fields.join('; ')}}`;
  }

  public valueToString(x: Record<string, any>) {
    for (const [name, type] of this._fields) {
      // eslint-disable-next-line
      if (x.hasOwnProperty(name)) {
        const value = type.valueToString(x[name]);
        if (value === 'null') {
          return `variant {${name}}`;
        } else {
          return `variant {${name}=${value}}`;
        }
      }
    }
    throw new Error('Variant has no data: ' + x);
  }

  get alternativesAsObject(): Record<number, Type> {
    const alternatives: Record<number, Type> = {};
    for (const [name, ty] of this._fields) {
      alternatives[idlLabelToId(name)] = ty;
    }
    return alternatives;
  }
}

/**
 * Represents a reference to an IDL type, used for defining recursive data
 * types.
 */
export class RecClass<T = any> extends ConstructType<T> {
  get typeName() {
    return IdlTypeName.RecClass;
  }

  private static _counter = 0;
  private _id = RecClass._counter++;
  private _type: ConstructType<T> | undefined;

  static [Symbol.hasInstance](instance: any): instance is RecClass {
    return instance.typeName === IdlTypeName.RecClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    return v.visitRec(this, this._type, d);
  }

  public fill(t: ConstructType<T>) {
    this._type = t;
  }

  public getType() {
    return this._type;
  }

  public covariant(x: any): x is T {
    if (this._type ? this._type.covariant(x) : false) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: T) {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    return this._type.encodeValue(x);
  }

  public _buildTypeTableImpl(typeTable: TypeTable) {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    typeTable.add(this, new Uint8Array([]));
    this._type.buildTypeTable(typeTable);
    typeTable.merge(this, this._type.name);
  }

  public decodeValue(b: Pipe, t: Type) {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    return this._type.decodeValue(b, t);
  }

  get name() {
    return `rec_${this._id}`;
  }

  public display() {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    return `μ${this.name}.${this._type.name}`;
  }

  public valueToString(x: T) {
    if (!this._type) {
      throw Error('Recursive type uninitialized.');
    }
    return this._type.valueToString(x);
  }
}

function decodePrincipalId(b: Pipe): PrincipalId {
  const x = safeReadUint8(b);
  if (x !== 1) {
    throw new Error('Cannot decode principal');
  }

  const len = Number(lebDecode(b));
  return PrincipalId.fromUint8Array(new Uint8Array(safeRead(b, len)));
}

/**
 * Represents an IDL principal reference
 */
export class PrincipalClass extends PrimitiveType<PrincipalId> {
  get typeName() {
    return IdlTypeName.PrincipalClass;
  }

  static [Symbol.hasInstance](instance: any): instance is PrincipalClass {
    return instance.typeName === IdlTypeName.PrincipalClass;
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitPrincipal(this, d);
  }

  public covariant(x: any): x is PrincipalId {
    if (x && x._isPrincipal) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: PrincipalId): Uint8Array {
    const buf = x.toUint8Array();
    const len = lebEncode(buf.byteLength);
    return concat(new Uint8Array([1]), len, buf);
  }
  public encodeType(): Uint8Array {
    return slebEncode(IDLTypeIds.Principal);
  }

  public decodeValue(b: Pipe, t: Type): PrincipalId {
    this.checkType(t);
    return decodePrincipalId(b);
  }

  get name() {
    return 'principal';
  }
  public valueToString(x: PrincipalId) {
    return `${this.name} "${x.toText()}"`;
  }
}

/**
 * The generic type of the arguments of an {@link Func|IDL Function}.
 */
export type GenericIdlFuncArgs = [Type, ...Type[]] | [];

/**
 * The generic type of the return values of an {@link Func|IDL Function}.
 */
export type GenericIdlFuncRets = [Type, ...Type[]] | [];

/**
 * Represents an IDL function reference.
 * @param argTypes Argument types.
 * @param retTypes Return types.
 * @param annotations Function annotations.
 */
export class FuncClass<
  Args extends GenericIdlFuncArgs = GenericIdlFuncArgs,
  Rets extends GenericIdlFuncRets = GenericIdlFuncRets,
> extends ConstructType<[PrincipalId, string]> {
  get typeName() {
    return IdlTypeName.FuncClass;
  }

  static [Symbol.hasInstance](instance: any): instance is FuncClass {
    return instance.typeName === IdlTypeName.FuncClass;
  }

  public static argsToString(types: Type[], v: any[]) {
    if (types.length !== v.length) {
      throw new Error('arity mismatch');
    }
    return '(' + types.map((t, i) => t.valueToString(v[i])).join(', ') + ')';
  }

  constructor(
    public argTypes: Args,
    public retTypes: Rets,
    public annotations: string[] = [],
  ) {
    super();
  }

  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitFunc(this, d);
  }
  public covariant(x: any): x is [PrincipalId, string] {
    if (Array.isArray(x) && x.length === 2 && x[0] && x[0]._isPrincipal && typeof x[1] === 'string')
      return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue([principal, methodName]: [PrincipalId, string]) {
    const buf = principal.toUint8Array();
    const len = lebEncode(buf.byteLength);
    const canister = concat(new Uint8Array([1]), len, buf);

    const method = new TextEncoder().encode(methodName);
    const methodLen = lebEncode(method.byteLength);
    return concat(new Uint8Array([1]), canister, methodLen, method);
  }

  public _buildTypeTableImpl(T: TypeTable) {
    this.argTypes.forEach(arg => arg.buildTypeTable(T));
    this.retTypes.forEach(arg => arg.buildTypeTable(T));

    const opCode = slebEncode(IDLTypeIds.Func);
    const argLen = lebEncode(this.argTypes.length);
    const args = concat(...this.argTypes.map(arg => arg.encodeType(T)));
    const retLen = lebEncode(this.retTypes.length);
    const rets = concat(...this.retTypes.map(arg => arg.encodeType(T)));
    const annLen = lebEncode(this.annotations.length);
    const anns = concat(...this.annotations.map(a => this.encodeAnnotation(a)));

    T.add(this, concat(opCode, argLen, args, retLen, rets, annLen, anns));
  }

  public decodeValue(b: Pipe, t: Type): [PrincipalId, string] {
    const tt = t instanceof RecClass ? (t.getType() ?? t) : t;
    if (!subtype(tt, this)) {
      throw new Error(
        `Cannot decode function reference at type ${this.display()} from wire type ${tt.display()}`,
      );
    }
    const x = safeReadUint8(b);
    if (x !== 1) {
      throw new Error('Cannot decode function reference');
    }
    const canister = decodePrincipalId(b);

    const mLen = Number(lebDecode(b));
    const buf = safeRead(b, mLen);
    const decoder = new TextDecoder('utf8', { fatal: true });
    const method = decoder.decode(buf);

    return [canister, method];
  }

  get name() {
    const args = this.argTypes.map(arg => arg.name).join(', ');
    const rets = this.retTypes.map(arg => arg.name).join(', ');
    const annon = ' ' + this.annotations.join(' ');
    return `(${args}) -> (${rets})${annon}`;
  }

  public valueToString([principal, str]: [PrincipalId, string]) {
    return `func "${principal.toText()}".${str}`;
  }

  public display(): string {
    const args = this.argTypes.map(arg => arg.display()).join(', ');
    const rets = this.retTypes.map(arg => arg.display()).join(', ');
    const annon = ' ' + this.annotations.join(' ');
    return `(${args}) → (${rets})${annon}`;
  }

  private encodeAnnotation(ann: string): Uint8Array {
    if (ann === 'query') {
      return new Uint8Array([1]);
    } else if (ann === 'oneway') {
      return new Uint8Array([2]);
    } else if (ann === 'composite_query') {
      return new Uint8Array([3]);
    } else {
      throw new Error('Illegal function annotation');
    }
  }
}

/**
 * The generic type of the fields of an {@link Service|IDL Service}.
 */
export type GenericIdlServiceFields = Record<string, FuncClass>;

export class ServiceClass<
  K extends string = string,
  Fields extends GenericIdlServiceFields = GenericIdlServiceFields,
> extends ConstructType<PrincipalId> {
  get typeName() {
    return IdlTypeName.ServiceClass;
  }

  static [Symbol.hasInstance](instance: any): instance is ServiceClass {
    return instance.typeName === IdlTypeName.ServiceClass;
  }

  public readonly _fields: Array<[K, Fields[K]]>;
  constructor(fields: Fields) {
    super();
    this._fields = Object.entries(fields).sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      }
      if (a[0] > b[0]) {
        return 1;
      }
      return 0;
    }) as Array<[K, Fields[K]]>;
  }
  public accept<D, R>(v: Visitor<D, R>, d: D): R {
    return v.visitService(this, d);
  }
  public covariant(x: any): x is PrincipalId {
    if (x && x._isPrincipal) return true;
    throw new Error(`Invalid ${this.display()} argument: ${toReadableString(x)}`);
  }

  public encodeValue(x: PrincipalId): Uint8Array {
    const buf = x.toUint8Array();
    const len = lebEncode(buf.length);
    return concat(new Uint8Array([1]), len, buf);
  }

  public _buildTypeTableImpl(T: TypeTable) {
    this._fields.forEach(([_, func]) => func.buildTypeTable(T));
    const opCode = slebEncode(IDLTypeIds.Service);
    const len = lebEncode(this._fields.length);
    const meths = this._fields.map(([label, func]) => {
      const labelBuf = new TextEncoder().encode(label);
      const labelLen = lebEncode(labelBuf.length);
      return concat(labelLen, labelBuf, func.encodeType(T));
    });

    T.add(this, concat(opCode, len, ...meths));
  }

  public decodeValue(b: Pipe, t: Type): PrincipalId {
    const tt = t instanceof RecClass ? (t.getType() ?? t) : t;
    if (!subtype(tt, this)) {
      throw new Error(
        `Cannot decode service reference at type ${this.display()} from wire type ${tt.display()}`,
      );
    }
    return decodePrincipalId(b);
  }
  get name() {
    const fields = this._fields.map(([key, value]) => key + ':' + value.name);
    return `service {${fields.join('; ')}}`;
  }

  public valueToString(x: PrincipalId) {
    return `service "${x.toText()}"`;
  }

  public fieldsAsObject(): Fields {
    const fields = {} as Fields;
    for (const [name, ty] of this._fields) {
      fields[name] = ty;
    }
    return fields;
  }
}

/**
 * Takes an unknown value and returns a string representation of it.
 * @param x - unknown value
 * @returns {string} string representation of the value
 */
function toReadableString(x: unknown): string {
  const str = JSON.stringify(x, (_key, value) =>
    typeof value === 'bigint' ? `BigInt(${value})` : value,
  );

  return str && str.length > toReadableString_max
    ? str.substring(0, toReadableString_max - 3) + '...'
    : str;
}

/**
 * Encode a array of values
 * @param argTypes - array of Types
 * @param args - array of values
 * @returns {Uint8Array} serialised value
 */
export function encode(argTypes: Array<Type<any>>, args: any[]): Uint8Array {
  if (args.length < argTypes.length) {
    throw Error('Wrong number of message arguments');
  }

  const typeTable = new TypeTable();
  argTypes.forEach(t => t.buildTypeTable(typeTable));

  const magic = new TextEncoder().encode(magicNumber);
  const table = typeTable.encode();
  const len = lebEncode(args.length);
  const typs = concat(...argTypes.map(t => t.encodeType(typeTable)));
  const vals = concat(
    ...zipWith(argTypes, args, (t, x) => {
      try {
        t.covariant(x);
      } catch (e: any) {
        const err = new Error(e.message + '\n\n');
        throw err;
      }

      return t.encodeValue(x);
    }),
  );

  return concat(magic, table, len, typs, vals);
}

/**
 * Decode a binary value
 * @param retTypes - Types expected in the buffer.
 * @param bytes - hex-encoded string, or buffer.
 * @returns Value deserialised to JS type
 */
export function decode(retTypes: Type[], bytes: Uint8Array): JsonValue[] {
  const b = new Pipe(bytes);

  if (bytes.byteLength < magicNumber.length) {
    throw new Error('Message length smaller than magic number');
  }
  const magicBuffer = safeRead(b, magicNumber.length);
  const magic = new TextDecoder().decode(magicBuffer);
  if (magic !== magicNumber) {
    throw new Error('Wrong magic number: ' + JSON.stringify(magic));
  }

  function readTypeTable(pipe: Pipe): [Array<[IDLTypeIds, any]>, number[]] {
    const typeTable: Array<[IDLTypeIds, any]> = [];
    const len = Number(lebDecode(pipe));

    for (let i = 0; i < len; i++) {
      const ty = Number(slebDecode(pipe));
      switch (ty) {
        case IDLTypeIds.Opt:
        case IDLTypeIds.Vector: {
          const t = Number(slebDecode(pipe));
          typeTable.push([ty, t]);
          break;
        }
        case IDLTypeIds.Record:
        case IDLTypeIds.Variant: {
          const fields = [];
          let objectLength = Number(lebDecode(pipe));
          let prevHash;
          while (objectLength--) {
            const hash = Number(lebDecode(pipe));
            if (hash >= Math.pow(2, 32)) {
              throw new Error('field id out of 32-bit range');
            }
            if (typeof prevHash === 'number' && prevHash >= hash) {
              throw new Error('field id collision or not sorted');
            }
            prevHash = hash;
            const t = Number(slebDecode(pipe));
            fields.push([hash, t]);
          }
          typeTable.push([ty, fields]);
          break;
        }
        case IDLTypeIds.Func: {
          const args = [];
          let argLength = Number(lebDecode(pipe));
          while (argLength--) {
            args.push(Number(slebDecode(pipe)));
          }
          const returnValues = [];
          let returnValuesLength = Number(lebDecode(pipe));
          while (returnValuesLength--) {
            returnValues.push(Number(slebDecode(pipe)));
          }
          const annotations = [];
          let annotationLength = Number(lebDecode(pipe));
          while (annotationLength--) {
            const annotation = Number(lebDecode(pipe));
            switch (annotation) {
              case 1: {
                annotations.push('query');
                break;
              }
              case 2: {
                annotations.push('oneway');
                break;
              }
              case 3: {
                annotations.push('composite_query');
                break;
              }
              default:
                throw new Error('unknown annotation');
            }
          }
          typeTable.push([ty, [args, returnValues, annotations]]);
          break;
        }
        case IDLTypeIds.Service: {
          let servLength = Number(lebDecode(pipe));
          const methods = [];
          while (servLength--) {
            const nameLength = Number(lebDecode(pipe));
            const funcName = new TextDecoder().decode(safeRead(pipe, nameLength));
            const funcType = slebDecode(pipe);
            methods.push([funcName, funcType]);
          }
          typeTable.push([ty, methods]);
          break;
        }
        default:
          throw new Error('Illegal op_code: ' + ty);
      }
    }

    const rawList: number[] = [];
    const length = Number(lebDecode(pipe));
    for (let i = 0; i < length; i++) {
      rawList.push(Number(slebDecode(pipe)));
    }
    return [typeTable, rawList];
  }
  const [rawTable, rawTypes] = readTypeTable(b);
  if (rawTypes.length < retTypes.length) {
    throw new Error('Wrong number of return values');
  }

  const table: RecClass[] = rawTable.map(_ => Rec());
  function getType(t: number): Type {
    if (t < -24) {
      throw new Error('future value not supported');
    }
    if (t < 0) {
      switch (t) {
        case -1:
          return Null;
        case -2:
          return Bool;
        case -3:
          return Nat;
        case -4:
          return Int;
        case -5:
          return Nat8;
        case -6:
          return Nat16;
        case -7:
          return Nat32;
        case -8:
          return Nat64;
        case -9:
          return Int8;
        case -10:
          return Int16;
        case -11:
          return Int32;
        case -12:
          return Int64;
        case -13:
          return Float32;
        case -14:
          return Float64;
        case -15:
          return Text;
        case -16:
          return Reserved;
        case -17:
          return Empty;
        case -24:
          return Principal;
        default:
          throw new Error('Illegal op_code: ' + t);
      }
    }
    if (t >= rawTable.length) {
      throw new Error('type index out of range');
    }
    return table[t];
  }
  function buildType(entry: [IDLTypeIds, any]): Type {
    switch (entry[0]) {
      case IDLTypeIds.Vector: {
        const ty = getType(entry[1]);
        return Vec(ty);
      }
      case IDLTypeIds.Opt: {
        const ty = getType(entry[1]);
        return Opt(ty);
      }
      case IDLTypeIds.Record: {
        const fields: Record<string, Type> = {};
        for (const [hash, ty] of entry[1]) {
          const name = `_${hash}_`;
          fields[name] = getType(ty);
        }
        const record = Record(fields);
        const tuple = record.tryAsTuple();
        if (Array.isArray(tuple)) {
          return Tuple(...tuple);
        } else {
          return record;
        }
      }
      case IDLTypeIds.Variant: {
        const fields: Record<string, Type> = {};
        for (const [hash, ty] of entry[1]) {
          const name = `_${hash}_`;
          fields[name] = getType(ty);
        }
        return Variant(fields);
      }
      case IDLTypeIds.Func: {
        const [args, returnValues, annotations] = entry[1];
        return Func(
          args.map((t: number) => getType(t)),
          returnValues.map((t: number) => getType(t)),
          annotations,
        );
      }
      case IDLTypeIds.Service: {
        const rec: Record<string, FuncClass> = {};
        const methods = entry[1] as [[string, number]];
        for (const [name, typeRef] of methods) {
          let type: Type | undefined = getType(typeRef);

          if (type instanceof RecClass) {
            // unpack reference type
            type = type.getType();
          }
          if (!(type instanceof FuncClass)) {
            throw new Error('Illegal service definition: services can only contain functions');
          }
          rec[name] = type;
        }
        return Service(rec);
      }
      default:
        throw new Error('Illegal op_code: ' + entry[0]);
    }
  }

  rawTable.forEach((entry, i) => {
    // Process function type first, so that we can construct the correct service type
    if (entry[0] === IDLTypeIds.Func) {
      const t = buildType(entry);
      table[i].fill(t);
    }
  });
  rawTable.forEach((entry, i) => {
    if (entry[0] !== IDLTypeIds.Func) {
      const t = buildType(entry);
      table[i].fill(t);
    }
  });

  resetSubtypeCache();
  const types = rawTypes.map(t => getType(t));
  try {
    const output = retTypes.map((t, i) => {
      return t.decodeValue(b, types[i]);
    });

    // skip unused values
    for (let ind = retTypes.length; ind < types.length; ind++) {
      types[ind].decodeValue(b, types[ind]);
    }

    if (b.byteLength > 0) {
      throw new Error('decode: Left-over bytes');
    }

    return output;
  } finally {
    resetSubtypeCache();
  }
}

/**
 * An Interface Factory, normally provided by a Candid code generation.
 */
export type InterfaceFactory = (idl: {
  IDL: {
    Empty: EmptyClass;
    Reserved: ReservedClass;
    Unknown: UnknownClass;
    Bool: BoolClass;
    Null: NullClass;
    Text: TextClass;
    Int: IntClass;
    Nat: NatClass;

    Float32: FloatClass;
    Float64: FloatClass;

    Int8: FixedIntClass;
    Int16: FixedIntClass;
    Int32: FixedIntClass;
    Int64: FixedIntClass;

    Nat8: FixedNatClass;
    Nat16: FixedNatClass;
    Nat32: FixedNatClass;
    Nat64: FixedNatClass;

    Principal: PrincipalClass;

    Tuple: typeof Tuple;
    Vec: typeof Vec;
    Opt: typeof Opt;
    Record: typeof Record;
    Variant: typeof Variant;
    Rec: typeof Rec;
    Func: typeof Func;

    Service(t: Record<string, FuncClass>): ServiceClass;
  };
}) => ServiceClass;

// Export Types instances.
export const Empty = new EmptyClass();
export const Reserved = new ReservedClass();
/**
 * Client-only type for deserializing unknown data. Not supported by Candid, and its use is discouraged.
 */
export const Unknown = new UnknownClass();
export const Bool = new BoolClass();
export const Null = new NullClass();
export const Text = new TextClass();
export const Int = new IntClass();
export const Nat = new NatClass();

export const Float32 = new FloatClass(32);
export const Float64 = new FloatClass(64);

export const Int8 = new FixedIntClass(8);
export const Int16 = new FixedIntClass(16);
export const Int32 = new FixedIntClass(32);
export const Int64 = new FixedIntClass(64);

export const Nat8 = new FixedNatClass(8);
export const Nat16 = new FixedNatClass(16);
export const Nat32 = new FixedNatClass(32);
export const Nat64 = new FixedNatClass(64);

export const Principal = new PrincipalClass();

/**
 *
 * @param types array of any types
 * @returns TupleClass from those types
 */
export function Tuple<T extends any[]>(...types: T): TupleClass<T> {
  return new TupleClass(types);
}
/**
 *
 * @param t IDL Type
 * @returns VecClass from that type
 */
export function Vec<T>(t: Type<T>): VecClass<T> {
  return new VecClass(t);
}
/**
 *
 * @param t IDL Type
 * @returns OptClass of Type
 */
export function Opt<T>(t: Type<T>): OptClass<T> {
  return new OptClass(t);
}
/**
 *
 * @param t Record of string and IDL Type
 * @returns RecordClass of string and Type
 */
export function Record(t: Record<string, Type>): RecordClass {
  return new RecordClass(t);
}

/**
 *
 * @param fields Record of string and IDL Type
 * @returns VariantClass
 */
export function Variant(fields: Record<string, Type>): VariantClass {
  return new VariantClass(fields);
}
/**
 *
 * @returns new RecClass
 */
export function Rec(): RecClass {
  return new RecClass();
}

/**
 *
 * @param args array of IDL Types
 * @param ret array of IDL Types
 * @param annotations array of strings, [] by default
 * @returns new FuncClass
 */
export function Func<
  Args extends GenericIdlFuncArgs = GenericIdlFuncArgs,
  Ret extends GenericIdlFuncRets = GenericIdlFuncRets,
>(args: Args, ret: Ret, annotations: string[] = []): FuncClass<Args, Ret> {
  return new FuncClass(args, ret, annotations);
}

/**
 *
 * @param t Record of string and FuncClass
 * @returns ServiceClass
 */
export function Service<
  K extends string = string,
  Fields extends GenericIdlServiceFields = GenericIdlServiceFields,
>(t: Fields): ServiceClass<K, Fields> {
  return new ServiceClass(t);
}

/**
 * The list of relations between types we assume to hold. Uses the types .name property as key
 */
class Relations {
  private rels: Map<string, Map<string, boolean>>;

  constructor(relations = new Map()) {
    this.rels = relations;
  }

  copy(): Relations {
    const copy = new Map();
    for (const [key, value] of this.rels.entries()) {
      const valCopy = new Map(value);
      copy.set(key, valCopy);
    }
    return new Relations(copy);
  }

  /// Returns whether we know for sure that a relation holds or doesn't (`true` or `false`), or
  /// if we don't know yet (`undefined`)
  known(t1: Type, t2: Type): boolean | undefined {
    return this.rels.get(t1.name)?.get(t2.name);
  }

  addNegative(t1: Type, t2: Type) {
    this.addNames(t1.name, t2.name, false);
  }

  add(t1: Type, t2: Type) {
    this.addNames(t1.name, t2.name, true);
  }

  display(): string {
    let result = '';
    for (const [t1, v] of this.rels) {
      for (const [t2, known] of v) {
        const subty = known ? ':<' : '!<:';
        result += `${t1} ${subty} ${t2}\n`;
      }
    }
    return result;
  }

  private addNames(t1: string, t2: string, isSubtype: boolean) {
    const t1Map = this.rels.get(t1);
    if (t1Map == undefined) {
      const newMap = new Map();
      newMap.set(t2, isSubtype);
      this.rels.set(t1, newMap);
    } else {
      t1Map.set(t2, isSubtype);
    }
  }
}

/// `subtypeCache` holds subtyping relations we've previously computed while decoding a message
let subtypeCache: Relations = new Relations();

/** Resets the global subtyping cache */
export function resetSubtypeCache() {
  subtypeCache = new Relations();
}

function eqFunctionAnnotations(t1: FuncClass, t2: FuncClass): boolean {
  const t1Annotations = new Set(t1.annotations);
  const t2Annotations = new Set(t2.annotations);
  if (t1Annotations.size !== t2Annotations.size) {
    return false;
  }
  for (const a of t1Annotations) {
    if (!t2Annotations.has(a)) return false;
  }
  return true;
}

function canBeOmmitted(t: Type) {
  return t instanceof OptClass || t instanceof NullClass || t instanceof ReservedClass;
}

/**
 * Subtyping on Candid types t1 <: t2 (Exported for testing)
 * @param t1 The potential subtype
 * @param t2 The potential supertype
 */
export function subtype(t1: Type, t2: Type): boolean {
  const relations = subtypeCache.copy();
  const isSubtype = subtype_(relations, t1, t2);
  if (isSubtype) {
    subtypeCache.add(t1, t2);
  } else {
    subtypeCache.addNegative(t1, t2);
  }
  return isSubtype;
}

function subtype_(relations: Relations, t1: Type, t2: Type): boolean {
  if (t1.name === t2.name) return true;
  const known = relations.known(t1, t2);
  if (known !== undefined) return known;
  relations.add(t1, t2);

  if (t2 instanceof ReservedClass) return true;
  if (t1 instanceof EmptyClass) return true;
  if (t1 instanceof NatClass && t2 instanceof IntClass) return true;
  if (t1 instanceof VecClass && t2 instanceof VecClass)
    return subtype_(relations, t1._type, t2._type);
  if (t2 instanceof OptClass) return true;
  if (t1 instanceof RecordClass && t2 instanceof RecordClass) {
    const t1Object = t1.fieldsAsObject;
    for (const [label, ty2] of t2._fields) {
      const ty1 = t1Object[idlLabelToId(label)];
      if (!ty1) {
        if (!canBeOmmitted(ty2)) return false;
      } else {
        if (!subtype_(relations, ty1, ty2)) return false;
      }
    }
    return true;
  }

  if (t1 instanceof FuncClass && t2 instanceof FuncClass) {
    if (!eqFunctionAnnotations(t1, t2)) return false;
    for (let i = 0; i < t1.argTypes.length; i++) {
      const argTy1 = t1.argTypes[i];
      if (i < t2.argTypes.length) {
        if (!subtype_(relations, t2.argTypes[i], argTy1)) return false;
      } else {
        if (!canBeOmmitted(argTy1)) return false;
      }
    }
    for (let i = 0; i < t2.retTypes.length; i++) {
      const retTy2 = t2.retTypes[i];
      if (i < t1.retTypes.length) {
        if (!subtype_(relations, t1.retTypes[i], retTy2)) return false;
      } else {
        if (!canBeOmmitted(retTy2)) return false;
      }
    }
    return true;
  }

  if (t1 instanceof VariantClass && t2 instanceof VariantClass) {
    const t2Object = t2.alternativesAsObject;
    for (const [label, ty1] of t1._fields) {
      const ty2 = t2Object[idlLabelToId(label)];
      if (!ty2) return false;
      if (!subtype_(relations, ty1, ty2)) return false;
    }
    return true;
  }

  if (t1 instanceof ServiceClass && t2 instanceof ServiceClass) {
    const t1Object = t1.fieldsAsObject();
    for (const [name, ty2] of t2._fields) {
      const ty1 = t1Object[name];
      if (!ty1) return false;
      if (!subtype_(relations, ty1, ty2)) return false;
    }
    return true;
  }

  if (t1 instanceof RecClass) {
    return subtype_(relations, t1.getType()!, t2);
  }
  if (t2 instanceof RecClass) {
    return subtype_(relations, t1, t2.getType()!);
  }
  return false;
}
