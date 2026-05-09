import bcrypt from "bcrypt";
import crypto from "crypto";

const ROUNDS = 12;
const LEGACY_SALT = "senmon-salt-2024";

export const PWD_VERSION_BCRYPT = 2;
export const PWD_VERSION_LEGACY = 1;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

function legacyHash(plain: string): string {
  return crypto.createHash("sha256").update(plain + LEGACY_SALT).digest("hex");
}

export async function verifyPassword(
  plain: string,
  stored: string,
  version: number,
): Promise<boolean> {
  if (version === PWD_VERSION_BCRYPT || stored.startsWith("$2")) {
    return bcrypt.compare(plain, stored);
  }
  const expected = Buffer.from(legacyHash(plain));
  const actual = Buffer.from(stored);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
