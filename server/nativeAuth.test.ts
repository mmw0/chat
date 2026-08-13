import { describe, expect, it } from "vitest";
import { authenticateNativeAccount, hashPassword, NativeAuthError, nativeCredentialsSchema, registerNativeAccount, verifyPassword } from "./nativeAuth";
import { toPublicUser } from "./publicUser";

describe("native Orbit authentication", () => {
  it("normalizes valid usernames and rejects unsafe account identifiers", () => {
    expect(nativeCredentialsSchema.parse({ username: "  Mina_Okafor ", password: "long-enough-pass" }).username).toBe("mina_okafor");
    expect(() => nativeCredentialsSchema.parse({ username: "mi", password: "long-enough-pass" })).toThrow();
    expect(() => nativeCredentialsSchema.parse({ username: "mina@example", password: "long-enough-pass" })).toThrow();
    expect(() => nativeCredentialsSchema.parse({ username: "mina", password: "short" })).toThrow();
  });

  it("stores a salted password verifier and never accepts an incorrect password", async () => {
    const hash = await hashPassword("a-long-unique-password");
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword("a-long-unique-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
    await expect(verifyPassword("a-long-unique-password", "not-a-password-hash")).resolves.toBe(false);
  });

  it("never serializes credential or external-identity fields into the browser user object", () => {
    const rawUser = {
      id: 12,
      openId: "native:mina",
      username: "mina",
      passwordHash: "scrypt$secret$never-expose",
      name: "mina",
      email: null,
      loginMethod: "password",
      role: "user" as const,
      statusText: "Available",
      avatarColor: "#DFF2C5",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const publicUser = toPublicUser(rawUser);
    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(publicUser).not.toHaveProperty("openId");
    expect(publicUser.username).toBe("mina");
  });

  it("rejects duplicate registrations and incorrect sign-in attempts through the account workflow", async () => {
    const user = {
      id: 12, openId: "native:mina", username: "mina", passwordHash: await hashPassword("a-long-unique-password"), name: "mina", email: null, loginMethod: "password", role: "user" as const, statusText: "Available", avatarColor: "#DFF2C5", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    };
    const store = {
      getUserByUsername: async (username: string) => username === "mina" ? user : undefined,
      createNativeUser: async () => user,
    };
    await expect(registerNativeAccount(store, { username: "mina", password: "a-long-unique-password" })).rejects.toMatchObject({ code: "USERNAME_TAKEN" satisfies NativeAuthError["code"] });
    await expect(authenticateNativeAccount(store, { username: "mina", password: "wrong-password" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" satisfies NativeAuthError["code"] });
    await expect(authenticateNativeAccount(store, { username: "mina", password: "a-long-unique-password" })).resolves.toBe(user);
  });
});
