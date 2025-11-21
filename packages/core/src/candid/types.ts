/* eslint-disable @typescript-eslint/no-empty-object-type */

export interface JsonArray extends Array<JsonValue> {}

export interface JsonObject extends Record<string, JsonValue> {}

export type JsonValue = boolean | string | number | bigint | JsonArray | JsonObject;
