import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
};

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64url");
    const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

    return `scrypt:${KEY_LENGTH}:${salt}:${derivedKey.toString("base64url")}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, keyLengthValue, salt, hash] = storedHash.split(":");

    if (algorithm !== "scrypt" || !keyLengthValue || !salt || !hash) {
      return false;
    }

    const keyLength = Number.parseInt(keyLengthValue, 10);

    if (!Number.isInteger(keyLength) || keyLength <= 0) {
      return false;
    }

    const expected = Buffer.from(hash, "base64url");
    const actual = (await scryptAsync(password, salt, keyLength)) as Buffer;

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
