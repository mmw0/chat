import { describe, expect, it } from "vitest";
import { sdk } from "./_core/sdk";

describe("native Orbit sessions", () => {
  it("signs and verifies a locally issued account session", async () => {
    const token = await sdk.createSessionToken("native:mina", { name: "mina", expiresInMs: 60_000 });
    await expect(sdk.verifySession(token)).resolves.toEqual({ openId: "native:mina", name: "mina" });
  });

  it("rejects a modified session token", async () => {
    const token = await sdk.createSessionToken("native:mina", { name: "mina", expiresInMs: 60_000 });
    const [header, payload, signature] = token.split(".");
    const modifiedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    const modified = `${header}.${payload}.${modifiedSignature}`;
    await expect(sdk.verifySession(modified)).resolves.toBeNull();
  });
});
