import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { getCiphertextPlaceholder, isOrbitEncryptedEnvelope } from "../shared/e2ee";
import { deviceIdentitySchema } from "./chatSchemas";

describe("Orbit E2EE transport guards", () => {
  const encrypted = `oc1.42.${"A".repeat(16)}.${"B".repeat(32)}.${"C".repeat(64)}`;

  it("accepts only versioned ciphertext envelopes", () => {
    expect(isOrbitEncryptedEnvelope(encrypted)).toBe(true);
    expect(isOrbitEncryptedEnvelope("A private message")).toBe(false);
    expect(isOrbitEncryptedEnvelope("oc1.short.bad.signature")).toBe(false);
    expect(getCiphertextPlaceholder(encrypted)).toBe("Encrypted signal");
    expect(getCiphertextPlaceholder("legacy readable message")).toBe("legacy readable message");
  });

  it("accepts structurally valid client public keys and rejects malformed identity publication", () => {
    expect(deviceIdentitySchema.parse({ encryptionPublicKey: JSON.stringify({ kty: "EC", crv: "P-256", x: "x".repeat(40), y: "y".repeat(40) }), signingPublicKey: JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "x".repeat(40) }), fingerprint: "A".repeat(24) }).fingerprint).toHaveLength(24);
    expect(() => deviceIdentitySchema.parse({ encryptionPublicKey: "not-a-key", signingPublicKey: "not-a-key", fingerprint: "invalid" })).toThrow();
  });

  it("derives matching AES-GCM keys for two devices and rejects a changed signed payload", async () => {
    const subtle = webcrypto.subtle;
    const text = new TextEncoder();
    const alice = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const bob = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const signing = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const aliceSecret = await subtle.deriveBits({ name: "ECDH", public: bob.publicKey }, alice.privateKey, 256);
    const bobSecret = await subtle.deriveBits({ name: "ECDH", public: alice.publicKey }, bob.privateKey, 256);
    const salt = await subtle.digest("SHA-256", text.encode("orbit-e2ee-v1"));
    const derive = async (secret: ArrayBuffer) => {
      const material = await subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
      return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: text.encode("orbit-conversation:42") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    };
    const aliceKey = await derive(aliceSecret);
    const bobKey = await derive(bobSecret);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: text.encode("orbit:42") }, aliceKey, text.encode("private Orbit signal"));
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv, additionalData: text.encode("orbit:42") }, bobKey, ciphertext);
    const payload = text.encode("oc1.42.iv.ciphertext");
    const signature = await subtle.sign("Ed25519", signing.privateKey, payload);
    expect(new TextDecoder().decode(decrypted)).toBe("private Orbit signal");
    await expect(subtle.verify("Ed25519", signing.publicKey, signature, payload)).resolves.toBe(true);
    await expect(subtle.verify("Ed25519", signing.publicKey, signature, text.encode("oc1.42.iv.changed"))).resolves.toBe(false);
  });
});
