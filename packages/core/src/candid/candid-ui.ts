/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as IDL from './idl.ts';
import { Principal } from '#principal';
import * as UI from './candid-core.ts';

type InputBox = UI.InputBox;

const InputConfig: UI.UIConfig = { parse: parsePrimitive };
const FormConfig: UI.FormConfig = { render: renderInput };

export const inputBox = (t: IDL.Type, config: Partial<UI.UIConfig>) => {
  return new UI.InputBox(t, { ...InputConfig, ...config });
};
export const recordForm = (fields: Array<[string, IDL.Type]>, config: Partial<UI.FormConfig>) => {
  return new UI.RecordForm(fields, { ...FormConfig, ...config });
};
export const tupleForm = (components: IDL.Type[], config: Partial<UI.FormConfig>) => {
  return new UI.TupleForm(components, { ...FormConfig, ...config });
};
export const variantForm = (fields: Array<[string, IDL.Type]>, config: Partial<UI.FormConfig>) => {
  return new UI.VariantForm(fields, { ...FormConfig, ...config });
};
export const optForm = (ty: IDL.Type, config: Partial<UI.FormConfig>) => {
  return new UI.OptionForm(ty, { ...FormConfig, ...config });
};
export const vecForm = (ty: IDL.Type, config: Partial<UI.FormConfig>) => {
  return new UI.VecForm(ty, { ...FormConfig, ...config });
};

export class Render extends IDL.Visitor<null, InputBox> {
  public visitType<T>(t: IDL.Type<T>, _d: null): InputBox {
    const input = document.createElement('input');
    input.classList.add('argument');
    input.placeholder = t.display();
    return inputBox(t, { input });
  }
  public visitNull(t: IDL.NullClass, _d: null): InputBox {
    return inputBox(t, {});
  }
  public visitRecord(t: IDL.RecordClass, fields: Array<[string, IDL.Type]>, _d: null): InputBox {
    let config = {};
    if (fields.length > 1) {
      const container = document.createElement('div');
      container.classList.add('popup-form');
      config = { container };
    }
    const form = recordForm(fields, config);
    return inputBox(t as IDL.Type<any>, { form });
  }
  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    _d: null,
  ): InputBox {
    let config = {};
    if (components.length > 1) {
      const container = document.createElement('div');
      container.classList.add('popup-form');
      config = { container };
    }
    const form = tupleForm(components, config);
    return inputBox(t as IDL.Type<any>, { form });
  }
  public visitVariant(t: IDL.VariantClass, fields: Array<[string, IDL.Type]>, _d: null): InputBox {
    const select = document.createElement('select');
    for (const [key, _type] of fields) {
      const option = new Option(key);
      select.add(option);
    }
    select.selectedIndex = -1;
    select.classList.add('open');
    const config: Partial<UI.FormConfig> = { open: select, event: 'change' };
    const form = variantForm(fields, config);
    return inputBox(t as IDL.Type<any>, { form });
  }
  public visitOpt<T>(t: IDL.OptClass<T>, ty: IDL.Type<T>, _d: null): InputBox {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('open');
    const form = optForm(ty, { open: checkbox, event: 'change' });
    return inputBox(t as IDL.Type<any>, { form });
  }
  public visitVec<T>(t: IDL.VecClass<T>, ty: IDL.Type<T>, _d: null): InputBox {
    const len = document.createElement('input');
    len.type = 'number';
    len.min = '0';
    len.max = '100';
    len.style.width = '8rem';
    len.placeholder = 'len';
    len.classList.add('open');
    const container = document.createElement('div');
    container.classList.add('popup-form');
    const form = vecForm(ty, { open: len, event: 'change', container });
    return inputBox(t, { form });
  }
  public visitRec<T>(_t: IDL.RecClass<T>, ty: IDL.ConstructType<T>, _d: null): InputBox {
    return renderInput(ty);
  }
}

class Parse extends IDL.Visitor<string, any> {
  public visitNull(_t: IDL.NullClass, _v: string): null {
    return null;
  }
  public visitBool(_t: IDL.BoolClass, v: string): boolean {
    if (v === 'true') {
      return true;
    }
    if (v === 'false') {
      return false;
    }
    throw new Error(`Cannot parse ${v} as boolean`);
  }
  public visitText(_t: IDL.TextClass, v: string): string {
    return v;
  }
  public visitFloat(_t: IDL.FloatClass, v: string): number {
    return parseFloat(v);
  }
  public visitFixedInt(t: IDL.FixedIntClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10);
    } else {
      return BigInt(v);
    }
  }
  public visitFixedNat(t: IDL.FixedNatClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10);
    } else {
      return BigInt(v);
    }
  }
  public visitNumber(_t: IDL.PrimitiveType, v: string): bigint {
    return BigInt(v);
  }
  public visitPrincipal(_t: IDL.PrincipalClass, v: string): Principal {
    return Principal.fromText(v);
  }
  public visitService(_t: IDL.ServiceClass, v: string): Principal {
    return Principal.fromText(v);
  }
  public visitFunc(_t: IDL.FuncClass, v: string): [Principal, string] {
    const x = v.split('.', 2);
    return [Principal.fromText(x[0]), x[1]];
  }
}

class Random extends IDL.Visitor<string, any> {
  public visitNull(_t: IDL.NullClass, _v: string): null {
    return null;
  }
  public visitBool(_t: IDL.BoolClass, _v: string): boolean {
    return Math.random() < 0.5;
  }
  public visitText(_t: IDL.TextClass, _v: string): string {
    return Math.random().toString(36).substring(6);
  }
  public visitFloat(_t: IDL.FloatClass, _v: string): number {
    return Math.random();
  }
  public visitInt(_t: IDL.IntClass, _v: string): bigint {
    return BigInt(this.generateNumber(true));
  }
  public visitNat(_t: IDL.NatClass, _v: string): bigint {
    return BigInt(this.generateNumber(false));
  }
  public visitFixedInt(t: IDL.FixedIntClass, v: string): number | bigint {
    const x = this.generateNumber(true);
    if (t._bits <= 32) {
      return x;
    } else {
      return BigInt(v);
    }
  }
  public visitFixedNat(t: IDL.FixedNatClass, v: string): number | bigint {
    const x = this.generateNumber(false);
    if (t._bits <= 32) {
      return x;
    } else {
      return BigInt(v);
    }
  }
  private generateNumber(signed: boolean): number {
    const num = Math.floor(Math.random() * 100);
    if (signed && Math.random() < 0.5) {
      return -num;
    } else {
      return num;
    }
  }
}

function parsePrimitive(t: IDL.Type, config: UI.ParseConfig, d: string) {
  if (config.random && d === '') {
    return t.accept(new Random(), d);
  } else {
    return t.accept(new Parse(), d);
  }
}

/**
 *
 * @param t an IDL type
 * @returns an input for that type
 */
export function renderInput(t: IDL.Type): InputBox {
  return t.accept(new Render(), null);
}

interface ValueConfig {
  input: InputBox;
  value: any;
}

/**
 *
 * @param t an IDL Type
 * @param input an InputBox
 * @param value any
 * @returns rendering that value to the provided input
 */
export function renderValue(t: IDL.Type, input: InputBox, value: any) {
  return t.accept(new RenderValue(), { input, value });
}

class RenderValue extends IDL.Visitor<ValueConfig, void> {
  public visitType<T>(t: IDL.Type<T>, d: ValueConfig) {
    (d.input.ui.input as HTMLInputElement).value = t.valueToString(d.value);
  }

  public visitNull(_t: IDL.NullClass, _d: ValueConfig) {}
  public visitText(_t: IDL.TextClass, d: ValueConfig) {
    (d.input.ui.input as HTMLInputElement).value = d.value;
  }
  public visitRec<T>(_t: IDL.RecClass<T>, ty: IDL.ConstructType<T>, d: ValueConfig): void {
    renderValue(ty, d.input, d.value);
  }
  public visitOpt<T>(_t: IDL.OptClass<T>, ty: IDL.Type<T>, d: ValueConfig): void {
    if (d.value.length === 0) {
      return;
    } else {
      const form = d.input.ui.form!;
      const open = form.ui.open as HTMLInputElement;
      open.checked = true;
      open.dispatchEvent(new Event(form.ui.event!));
      renderValue(ty, form.form[0], d.value[0]);
    }
  }
  public visitRecord(_t: IDL.RecordClass, fields: Array<[string, IDL.Type]>, d: ValueConfig) {
    const form = d.input.ui.form!;
    fields.forEach(([key, type], i) => {
      renderValue(type, form.form[i], d.value[key]);
    });
  }
  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    d: ValueConfig,
  ) {
    const form = d.input.ui.form!;
    components.forEach((type, i) => {
      renderValue(type, form.form[i], d.value[i]);
    });
  }
  public visitVariant(_t: IDL.VariantClass, fields: Array<[string, IDL.Type]>, d: ValueConfig) {
    const form = d.input.ui.form!;
    const selected = Object.entries(d.value)[0];
    fields.forEach(([key, type], i) => {
      if (key === selected[0]) {
        const open = form.ui.open as HTMLSelectElement;
        open.selectedIndex = i;
        open.dispatchEvent(new Event(form.ui.event!));
        renderValue(type, form.form[0], selected[1]);
      }
    });
  }
  public visitVec<T>(_t: IDL.VecClass<T>, ty: IDL.Type<T>, d: ValueConfig) {
    const form = d.input.ui.form!;
    const len = d.value.length;
    const open = form.ui.open as HTMLInputElement;
    open.value = len;
    open.dispatchEvent(new Event(form.ui.event!));
    d.value.forEach((v: T, i: number) => {
      renderValue(ty, form.form[i], v);
    });
  }
}
