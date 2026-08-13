import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { User } from "../drizzle/schema";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export const nativeCredentialsSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores only."),
  password: z.string().min(8).max(128),
});

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  const [algorithm, salt, storedKey] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !storedKey) return false;

  try {
    const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
    const stored = Buffer.from(storedKey, "base64url");
    return stored.length === derivedKey.length && timingSafeEqual(stored, derivedKey);
  } catch {
    return false;
  }
}

type NativeUserStore = {
  getUserByUsername: (username: string) => Promise<User | undefined>;
  createNativeUser: (input: { username: string; passwordHash: string }) => Promise<User>;
};

export class NativeAuthError extends Error {
  constructor(public readonly code: "USERNAME_TAKEN" | "INVALID_CREDENTIALS") {
    super(code);
  }
}

export async function registerNativeAccount(store: NativeUserStore, credentials: z.infer<typeof nativeCredentialsSchema>) {
  const existing = await store.getUserByUsername(credentials.username);
  if (existing) throw new NativeAuthError("USERNAME_TAKEN");
  const passwordHash = await hashPassword(credentials.password);
  try {
    return await store.createNativeUser({ username: credentials.username, passwordHash });
  } catch (error) {
    if (error instanceof Error && error.message === "USERNAME_TAKEN") throw new NativeAuthError("USERNAME_TAKEN");
    throw error;
  }
}

export async function authenticateNativeAccount(store: Pick<NativeUserStore, "getUserByUsername">, credentials: z.infer<typeof nativeCredentialsSchema>) {
  const user = await store.getUserByUsername(credentials.username);
  if (!user || !await verifyPassword(credentials.password, user.passwordHash)) throw new NativeAuthError("INVALID_CREDENTIALS");
  return user;
}
