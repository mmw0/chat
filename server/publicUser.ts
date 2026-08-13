import type { User } from "../drizzle/schema";

/** Omits secrets and internal identity data before a user reaches the browser. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    statusText: user.statusText,
    avatarColor: user.avatarColor,
    avatarId: user.avatarId,
    encryptionPublicKey: user.encryptionPublicKey,
    signingPublicKey: user.signingPublicKey,
    encryptionFingerprint: user.encryptionFingerprint,
    role: user.role,
    createdAt: user.createdAt,
    lastSignedIn: user.lastSignedIn,
  };
}
