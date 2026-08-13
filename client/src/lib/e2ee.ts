import { E2EE_ENVELOPE_PREFIX, isOrbitEncryptedEnvelope } from "@shared/e2ee";

type IdentityRecord = {
  id: string;
  encryptionPublicJwk: JsonWebKey;
  encryptionPrivateKey: CryptoKey;
  signingPublicJwk: JsonWebKey;
  signingPrivateKey: CryptoKey;
};

export type DeviceIdentity = IdentityRecord & { fingerprint: string };

const DB_NAME = "orbit-e2ee-device-v1";
const STORE_NAME = "identities";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  new Uint8Array(bytes).forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function openIdentityDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readIdentity(id: string) {
  const db = await openIdentityDb();
  return new Promise<IdentityRecord | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as IdentityRecord | undefined);
  });
}

async function writeIdentity(identity: IdentityRecord) {
  const db = await openIdentityDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(identity);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function fingerprint(publicJwk: JsonWebKey) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(publicJwk)));
  return toBase64Url(digest).slice(0, 24);
}

async function createIdentity(id: string): Promise<IdentityRecord> {
  const encryptionGenerated = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const encryptionPublicJwk = await crypto.subtle.exportKey("jwk", encryptionGenerated.publicKey);
  const encryptionPrivateJwk = await crypto.subtle.exportKey("jwk", encryptionGenerated.privateKey);
  const encryptionPrivateKey = await crypto.subtle.importKey("jwk", encryptionPrivateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const signingGenerated = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const signingPublicJwk = await crypto.subtle.exportKey("jwk", signingGenerated.publicKey);
  const signingPrivateJwk = await crypto.subtle.exportKey("jwk", signingGenerated.privateKey);
  const signingPrivateKey = await crypto.subtle.importKey("jwk", signingPrivateJwk, { name: "Ed25519" }, false, ["sign"]);
  return { id, encryptionPublicJwk, encryptionPrivateKey, signingPublicJwk, signingPrivateKey };
}

export async function getDeviceIdentity(accountId: number, establishedEncryptionPublicKey?: string | null): Promise<DeviceIdentity> {
  const id = `account-${accountId}`;
  const existing = await readIdentity(id);
  const legacy = existing ? undefined : await readIdentity("primary");
  const identity = existing ?? (legacy && establishedEncryptionPublicKey && JSON.stringify(legacy.encryptionPublicJwk) === establishedEncryptionPublicKey
    ? { ...legacy, id }
    : await createIdentity(id));
  if (!existing) await writeIdentity(identity);
  return { ...identity, fingerprint: await fingerprint(identity.encryptionPublicJwk) };
}

async function getConversationKey(identity: DeviceIdentity, peerEncryptionPublicKey: string, conversationId: number) {
  const peerKey = await crypto.subtle.importKey("jwk", JSON.parse(peerEncryptionPublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, identity.encryptionPrivateKey, 256);
  const keyMaterial = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const salt = await crypto.subtle.digest("SHA-256", encoder.encode("orbit-e2ee-v1"));
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(`orbit-conversation:${conversationId}`) }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function signaturePayload(conversationId: number, iv: string, ciphertext: string) {
  return encoder.encode(`${E2EE_ENVELOPE_PREFIX}.${conversationId}.${iv}.${ciphertext}`);
}

export async function encryptDirectMessage(input: { plaintext: string; identity: DeviceIdentity; peerEncryptionPublicKey: string; conversationId: number }) {
  const key = await getConversationKey(input.identity, input.peerEncryptionPublicKey, input.conversationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`orbit:${input.conversationId}`) }, key, encoder.encode(input.plaintext));
  const ivValue = toBase64Url(iv.buffer);
  const ciphertext = toBase64Url(encrypted);
  const signature = await crypto.subtle.sign("Ed25519", input.identity.signingPrivateKey, signaturePayload(input.conversationId, ivValue, ciphertext));
  return `${E2EE_ENVELOPE_PREFIX}.${input.conversationId}.${ivValue}.${ciphertext}.${toBase64Url(signature)}`;
}

export async function decryptDirectMessage(input: { envelope: string; identity: DeviceIdentity; peerEncryptionPublicKey: string; senderSigningPublicKey: string; conversationId: number }) {
  if (!isOrbitEncryptedEnvelope(input.envelope)) return input.envelope;
  const [, envelopeConversationId, ivValue, ciphertext, signatureValue] = input.envelope.split(".");
  if (Number(envelopeConversationId) !== input.conversationId) throw new Error("Message envelope conversation mismatch.");
  const senderKey = await crypto.subtle.importKey("jwk", JSON.parse(input.senderSigningPublicKey), { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("Ed25519", senderKey, fromBase64Url(signatureValue), signaturePayload(input.conversationId, ivValue, ciphertext));
  if (!valid) throw new Error("Message signature could not be verified.");
  const key = await getConversationKey(input.identity, input.peerEncryptionPublicKey, input.conversationId);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivValue), additionalData: encoder.encode(`orbit:${input.conversationId}`) }, key, fromBase64Url(ciphertext));
  return decoder.decode(decrypted);
}
