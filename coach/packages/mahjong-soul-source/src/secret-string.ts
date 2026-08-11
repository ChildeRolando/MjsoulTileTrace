import { inspect } from "node:util";

const REDACTED = "[REDACTED]";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export class SecretString {
  #value: string;

  private constructor(value: string) {
    if (value.length < 8 || value.length > 4096) {
      throw new Error("mahjong_soul_login_protocol_unsupported");
    }
    this.#value = value;
    Object.freeze(this);
  }

  static from(value: string): SecretString {
    if (!isString(value)) {
      throw new Error("mahjong_soul_login_protocol_unsupported");
    }
    return new SecretString(value);
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
