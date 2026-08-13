import process from "node:process";
import { randomBytes, webcrypto } from "node:crypto";

const baseUrl = process.env.ORBIT_TEST_BASE || "http://127.0.0.1:3000";
const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const password = `Orbit-pass-${suffix}`;
const changedPassword = `Orbit-next-${suffix}`;
const usernames = { first: `orbitverify${suffix}`, second: `orbitpeer${suffix}` };
const crypto = webcrypto;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url");
}

async function createSecureDevice() {
  const encryption = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const signing = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return {
    encryption,
    signing,
    encryptionPublicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", encryption.publicKey)),
    signingPublicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", signing.publicKey)),
    fingerprint: randomBytes(18).toString("base64url"),
  };
}

async function conversationKey(privateKey, peerPublicKey, conversationId) {
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  const salt = await crypto.subtle.digest("SHA-256", encoder.encode("orbit-e2ee-v1"));
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(`orbit-conversation:${conversationId}`) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptEnvelope(sender, peerEncryptionPublicKey, conversationId, plaintext) {
  const peer = await crypto.subtle.importKey("jwk", JSON.parse(peerEncryptionPublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const key = await conversationKey(sender.encryption.privateKey, peer, conversationId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`orbit:${conversationId}`) }, key, encoder.encode(plaintext));
  const ivValue = base64Url(iv);
  const ciphertextValue = base64Url(ciphertext);
  const payload = encoder.encode(`oc1.${conversationId}.${ivValue}.${ciphertextValue}`);
  const signature = await crypto.subtle.sign("Ed25519", sender.signing.privateKey, payload);
  return `oc1.${conversationId}.${ivValue}.${ciphertextValue}.${base64Url(signature)}`;
}

async function decryptEnvelope(recipient, senderEncryptionPublicKey, senderSigningPublicKey, conversationId, envelope) {
  const [, envelopeConversationId, ivValue, ciphertextValue, signatureValue] = envelope.split(".");
  if (Number(envelopeConversationId) !== conversationId) throw new Error("E2EE envelope conversation mismatch");
  const senderEncryption = await crypto.subtle.importKey("jwk", JSON.parse(senderEncryptionPublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const senderSigning = await crypto.subtle.importKey("jwk", JSON.parse(senderSigningPublicKey), { name: "Ed25519" }, false, ["verify"]);
  const payload = encoder.encode(`oc1.${conversationId}.${ivValue}.${ciphertextValue}`);
  if (!await crypto.subtle.verify("Ed25519", senderSigning, fromBase64Url(signatureValue), payload)) throw new Error("E2EE signature verification failed");
  const key = await conversationKey(recipient.encryption.privateKey, senderEncryption, conversationId);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivValue), additionalData: encoder.encode(`orbit:${conversationId}`) }, key, fromBase64Url(ciphertextValue));
  return decoder.decode(plaintext);
}

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : "";
}

function decode(payload) {
  const node = Array.isArray(payload) ? payload[0] : payload;
  if (node?.error) throw new Error(node.error.json?.message || node.error.message || "tRPC error");
  return node?.result?.data?.json;
}

async function mutation(client, procedure, input) {
  const response = await fetch(`${baseUrl}/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(client.cookie ? { cookie: client.cookie } : {}) },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  const value = decode(payload);
  const newCookie = cookieFrom(response);
  if (newCookie) client.cookie = newCookie;
  return value;
}

async function query(client, procedure, input = undefined) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const response = await fetch(`${baseUrl}/api/trpc/${procedure}?input=${encoded}`, {
    headers: client.cookie ? { cookie: client.cookie } : {},
    signal: AbortSignal.timeout(20_000),
  });
  return decode(await response.json());
}

async function expectMutationFailure(client, procedure, input, message) {
  try {
    await mutation(client, procedure, input);
  } catch {
    return;
  }
  throw new Error(message);
}

  const first = { cookie: "", username: usernames.first };
  const second = { cookie: "", username: usernames.second };
  const pairedBrowser = { cookie: "", username: usernames.first };
	const third = { cookie: "", username: `orbitdecline${suffix}` };
const linkRecipient = { cookie: "", username: `orbitlink${suffix}` };

try {
  await mutation(first, "nativeAuth.register", { username: first.username, password });
  await mutation(second, "nativeAuth.register", { username: second.username, password });
  await mutation(third, "nativeAuth.register", { username: third.username, password });
  await mutation(linkRecipient, "nativeAuth.register", { username: linkRecipient.username, password });
  const updatedProfile = await mutation(first, "profile.update", { name: "Orbit verification", statusText: "Running a secure smoke test", avatarColor: "#DDF5C9", avatarId: "orbit-73" });
  if (updatedProfile.avatarId !== "orbit-73") throw new Error("Built-in avatar selection was not persisted");
  await mutation(first, "profile.changePassword", { currentPassword: password, newPassword: changedPassword });
  await expectMutationFailure({ cookie: "", username: first.username }, "nativeAuth.login", { username: first.username, password }, "Previous password remained valid after password change");

  const exactResults = await query(first, "contacts.search", { username: second.username });
  if (!exactResults.some(person => person.username === second.username)) throw new Error("Exact username discovery failed");
  const partialResults = await query(first, "contacts.search", { username: second.username.slice(0, -2) });
  if (!partialResults.some(person => person.username === second.username)) throw new Error("Partial username discovery failed");
  const secondProfile = await query(second, "auth.me");
  await expectMutationFailure(first, "chat.createDirect", { userId: secondProfile.id }, "Direct chat was incorrectly allowed before request approval");

  await mutation(first, "contacts.sendRequest", { username: second.username });
  const requests = await query(second, "contacts.requests");
  const request = requests.incoming.find(item => item.user.username === first.username);
  if (!request) throw new Error("Contact request was not delivered");
  const approval = await mutation(second, "contacts.respond", { requestId: request.request.id, accept: true });
  if (!approval.conversationId) throw new Error("Approval did not create a direct chat");
  if (!await mutation(first, "chat.createDirect", { userId: secondProfile.id })) throw new Error("Approved direct chat was not available");
  await mutation(first, "chat.setMute", { conversationId: approval.conversationId, duration: 3600 });
  await mutation(first, "chat.setOrganization", { conversationId: approval.conversationId, favorite: true, label: "Acceptance peer" });
  const organizedContacts = await query(first, "contacts.list");
  const organizedPeer = organizedContacts.find(contact => contact.username === second.username);
  if (!organizedPeer?.mutedUntil || !organizedPeer.isFavorite || organizedPeer.personalLabel !== "Acceptance peer") throw new Error("Personal mute, favorite, or label state was not persisted");
  await mutation(first, "chat.setArchived", { conversationId: approval.conversationId, archived: true });
  if (!(await query(first, "contacts.list")).find(contact => contact.username === second.username)?.archivedAt) throw new Error("Personal archive state was not persisted");
  await mutation(first, "chat.setArchived", { conversationId: approval.conversationId, archived: false });

  await mutation(first, "contacts.sendRequest", { username: third.username });
  const cancellable = await query(first, "contacts.requests");
  const outgoing = cancellable.outgoing.find(item => item.user.username === third.username);
  if (!outgoing) throw new Error("Cancellable request was not recorded");
  await mutation(first, "contacts.cancel", { requestId: outgoing.request.id });
  await mutation(first, "contacts.sendRequest", { username: third.username });
  const declinable = await query(third, "contacts.requests");
  const incoming = declinable.incoming.find(item => item.user.username === first.username);
  if (!incoming) throw new Error("Declinable request was not delivered");
  await mutation(third, "contacts.respond", { requestId: incoming.request.id, accept: false });

  await mutation(first, "chat.sendMessage", { conversationId: approval.conversationId, body: "Verified direct message." });
  await mutation(first, "chat.heartbeat", { activeConversationId: approval.conversationId });
  await mutation(second, "chat.heartbeat", { activeConversationId: approval.conversationId });
  await mutation(first, "chat.setTyping", { conversationId: approval.conversationId, isTyping: true });
  const timeline = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  if (!timeline.some(message => message.body === "Verified direct message.")) throw new Error("Direct message was not persisted");
  const verifiedMessage = timeline.find(message => message.body === "Verified direct message.");
  const unreadBeforeRead = await query(second, "chat.listConversations");
  if ((unreadBeforeRead.find(conversation => conversation.id === approval.conversationId)?.unread ?? 0) < 1) throw new Error("Incoming message did not create an unread acknowledgement state");
  await mutation(second, "chat.sendMessage", { conversationId: approval.conversationId, body: "Verified reply context.", replyToMessageId: verifiedMessage.id });
  const repliedTimeline = await query(first, "chat.listMessages", { conversationId: approval.conversationId });
  const replyMessage = repliedTimeline.find(message => message.body === "Verified reply context.");
  if (replyMessage?.reply?.id !== verifiedMessage.id) throw new Error("Reply context was not available to the approved peer");
  await mutation(first, "chat.toggleReaction", { messageId: verifiedMessage.id, emoji: "♥" });
  await mutation(first, "chat.editMessage", { messageId: verifiedMessage.id, body: "Updated direct message." });
  await expectMutationFailure(second, "chat.editMessage", { messageId: verifiedMessage.id, body: "Peer override attempt." }, "A peer incorrectly edited someone else’s message");
  await mutation(first, "chat.setPinned", { messageId: verifiedMessage.id, pinned: true });
  const pinned = await query(second, "chat.listPinned", { conversationId: approval.conversationId });
  if (!pinned.some(message => message.id === verifiedMessage.id && message.body === "Updated direct message.")) throw new Error("Pinned message was not available to the approved peer");
  await mutation(first, "chat.toggleSaved", { messageId: verifiedMessage.id });
  const saved = await query(first, "chat.listSaved");
  if (!saved.some(message => message.id === verifiedMessage.id && message.savedByMe)) throw new Error("Saved message was not available to its owner");
  const searched = await query(second, "chat.searchMessages", { conversationId: approval.conversationId, query: "Updated direct" });
  if (!searched.some(message => message.id === verifiedMessage.id)) throw new Error("Advanced conversation search did not find an approved message");
  await mutation(first, "chat.sendMessage", { conversationId: approval.conversationId, body: "This signal will be retracted." });
  const retractableTimeline = await query(first, "chat.listMessages", { conversationId: approval.conversationId });
  const retractable = retractableTimeline.find(message => message.body === "This signal will be retracted.");
  if (!retractable) throw new Error("Retractable message was not persisted");
  await mutation(first, "chat.retractMessage", { messageId: retractable.id });
  const redactedTimeline = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  if (!redactedTimeline.some(message => message.id === retractable.id && message.body === "Message retracted" && message.deletedAt)) throw new Error("Message retraction was not visible to the approved peer");
  const activity = await query(second, "chat.activity", { conversationId: approval.conversationId });
  const firstProfile = await query(first, "auth.me");
  if (!activity.members.some(person => person.id === firstProfile.id && person.presenceState === "online")) throw new Error("Heartbeat presence was not available to the approved peer");
  if (!activity.typing.some(person => person.id === firstProfile.id)) throw new Error("Typing activity was not persisted");
  await mutation(second, "chat.markRead", { conversationId: approval.conversationId });
  const unreadAfterRead = await query(second, "chat.listConversations");
  if ((unreadAfterRead.find(conversation => conversation.id === approval.conversationId)?.unread ?? -1) !== 0) throw new Error("Read acknowledgement did not clear the recipient unread state");
  await mutation(first, "chat.setDisappearing", { conversationId: approval.conversationId, duration: 3600 });
  await mutation(first, "chat.sendMessage", { conversationId: approval.conversationId, body: "This signal has a timer." });
  const disappearingTimeline = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  const disappearing = disappearingTimeline.find(message => message.body === "This signal has a timer.");
  if (!disappearing?.expiresAt) throw new Error("Disappearing-message expiry was not persisted");
  await mutation(first, "chat.setDisappearing", { conversationId: approval.conversationId, duration: 0 });
  await mutation(first, "chat.clearHistory", { conversationId: approval.conversationId });
  const clearedTimeline = await query(first, "chat.listMessages", { conversationId: approval.conversationId });
  if (clearedTimeline.length) throw new Error("Private clear-history did not hide earlier messages for its owner");
  const peerTimelineAfterClear = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  if (!peerTimelineAfterClear.length) throw new Error("Private clear-history incorrectly removed the peer's messages");

  const trustedLink = await mutation(first, "contacts.createTrustedLink", {});
  if (!trustedLink.token || !trustedLink.path) throw new Error("Trusted link was not created");
  const trustedConnection = await mutation(linkRecipient, "contacts.redeemTrustedLink", { token: trustedLink.token });
  if (!trustedConnection.conversationId) throw new Error("Trusted link did not create a direct connection");
  await expectMutationFailure(third, "contacts.redeemTrustedLink", { token: trustedLink.token }, "A one-time trusted link was redeemed more than once");
  const linkContacts = await query(linkRecipient, "contacts.list");
  if (!linkContacts.some(contact => contact.username === first.username && contact.conversationId === trustedConnection.conversationId)) throw new Error("Trusted link did not create an accepted contact without a request");

  await mutation(first, "chat.deleteDirect", { conversationId: approval.conversationId });
  const contactsAfterDelete = await query(second, "contacts.list");
  if (!contactsAfterDelete.some(contact => contact.username === first.username && contact.conversationId === approval.conversationId)) throw new Error("Private chat removal incorrectly removed the peer's direct relationship");
  const peerTimelineAfterRemoval = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  if (!peerTimelineAfterRemoval.some(message => message.body === "Updated direct message.")) throw new Error("Private chat removal incorrectly removed the peer's history");

  const firstDevice = await createSecureDevice();
  const secondDevice = await createSecureDevice();
  await mutation(first, "security.publishDeviceIdentity", { encryptionPublicKey: firstDevice.encryptionPublicKey, signingPublicKey: firstDevice.signingPublicKey, fingerprint: firstDevice.fingerprint });
  await mutation(second, "security.publishDeviceIdentity", { encryptionPublicKey: secondDevice.encryptionPublicKey, signingPublicKey: secondDevice.signingPublicKey, fingerprint: secondDevice.fingerprint });
  await expectMutationFailure(first, "chat.sendMessage", { conversationId: approval.conversationId, body: "Plaintext must be rejected once secure devices are ready." }, "E2EE-ready direct chat accepted plaintext");
  const encryptedBody = await encryptEnvelope(firstDevice, secondDevice.encryptionPublicKey, approval.conversationId, "Verified two-user encrypted transport.");
  await mutation(first, "chat.sendMessage", { conversationId: approval.conversationId, body: encryptedBody });
  const encryptedTimeline = await query(second, "chat.listMessages", { conversationId: approval.conversationId });
  const encryptedMessage = encryptedTimeline.find(message => message.body === encryptedBody);
  if (!encryptedMessage?.body.startsWith("oc1.")) throw new Error("Encrypted envelope was not persisted for the approved peer");
  const decrypted = await decryptEnvelope(secondDevice, firstDevice.encryptionPublicKey, firstDevice.signingPublicKey, approval.conversationId, encryptedMessage.body);
  if (decrypted !== "Verified two-user encrypted transport.") throw new Error("Approved peer could not decrypt the two-user encrypted message");
  await mutation(pairedBrowser, "nativeAuth.login", { username: first.username, password: changedPassword });
  const originalDeviceId = `device-${firstDevice.fingerprint}`;
  await mutation(first, "security.syncDevice", { deviceId: originalDeviceId, label: "Original acceptance browser", encryptionPublicKey: firstDevice.encryptionPublicKey, signingPublicKey: firstDevice.signingPublicKey, fingerprint: firstDevice.fingerprint });
  const joiningDevice = await createSecureDevice();
  const pairing = await mutation(first, "security.createPairing", { fingerprint: firstDevice.fingerprint });
  if (!pairing.token || !pairing.path) throw new Error("Secure-device pairing link was not created");
  await expectMutationFailure(second, "security.requestPairing", { token: pairing.token, deviceId: `device-${secondDevice.fingerprint}`, label: "Unrelated account", encryptionPublicKey: secondDevice.encryptionPublicKey, signingPublicKey: secondDevice.signingPublicKey, fingerprint: secondDevice.fingerprint }, "A different account could request a secure-device pairing");
  await mutation(pairedBrowser, "security.requestPairing", { token: pairing.token, deviceId: `device-${joiningDevice.fingerprint}`, label: "Paired acceptance browser", encryptionPublicKey: joiningDevice.encryptionPublicKey, signingPublicKey: joiningDevice.signingPublicKey, fingerprint: joiningDevice.fingerprint });
  const pendingDevices = await query(first, "security.listDevices");
  const pendingPairing = pendingDevices.pairings.find(item => item.status === "pending" && item.targetFingerprint === joiningDevice.fingerprint);
  if (!pendingPairing) throw new Error("Joining browser did not produce a pending pairing approval");
  await mutation(first, "security.approvePairing", { pairingId: pendingPairing.id, approve: true });
  const pairedDevices = await query(first, "security.listDevices");
  if (!pairedDevices.devices.some(device => device.deviceId === originalDeviceId && device.status === "active") || !pairedDevices.devices.some(device => device.deviceId === `device-${joiningDevice.fingerprint}` && device.status === "active")) throw new Error("Approved device pairing did not activate both secure-device records");
  if (!pairedDevices.history.some(entry => entry.event === "paired" && entry.fingerprint === joiningDevice.fingerprint)) throw new Error("Approved device pairing did not append key history");
  await mutation(first, "security.revokeDevice", { deviceId: `device-${joiningDevice.fingerprint}` });
  const revokedDevices = await query(first, "security.listDevices");
  if (!revokedDevices.devices.some(device => device.deviceId === `device-${joiningDevice.fingerprint}` && device.status === "revoked") || !revokedDevices.history.some(entry => entry.event === "revoked" && entry.fingerprint === joiningDevice.fingerprint)) throw new Error("Device revocation did not retain an auditable device and key-history record");
  await expectMutationFailure(first, "security.revokeDevice", { deviceId: originalDeviceId }, "The final active secure device was revoked");
  const recoveredFirstDevice = await createSecureDevice();
  await mutation(first, "security.recoverDeviceIdentity", { encryptionPublicKey: recoveredFirstDevice.encryptionPublicKey, signingPublicKey: recoveredFirstDevice.signingPublicKey, fingerprint: recoveredFirstDevice.fingerprint, currentPassword: changedPassword, confirmation: "REPLACE_DEVICE_KEY" });
  const recoveredEnvelope = await encryptEnvelope(recoveredFirstDevice, secondDevice.encryptionPublicKey, approval.conversationId, "Verified recovered-device encrypted transport.");
  await mutation(first, "chat.sendMessage", { conversationId: approval.conversationId, body: recoveredEnvelope });
  if (await decryptEnvelope(secondDevice, recoveredFirstDevice.encryptionPublicKey, recoveredFirstDevice.signingPublicKey, approval.conversationId, recoveredEnvelope) !== "Verified recovered-device encrypted transport.") throw new Error("Peer could not decrypt the recovered-device encrypted message");

  const legacyConversationId = await mutation(first, "chat.createConversation", { name: `legacy-orbit-${suffix}`, description: "Temporary deletion cleanup verification" });

  await mutation(first, "profile.deleteAccount", { password: changedPassword, confirmation: "DELETE" });
  const replacement = { cookie: "", username: first.username };
  await mutation(replacement, "nativeAuth.register", { username: replacement.username, password });
  const replacementConversations = await query(replacement, "chat.listConversations");
  if (replacementConversations.some(conversation => conversation.id === legacyConversationId)) throw new Error("Deleted account's legacy room leaked into the replacement account");
  await mutation(replacement, "profile.deleteAccount", { password, confirmation: "DELETE" });
  await mutation(second, "profile.deleteAccount", { password, confirmation: "DELETE" });
  await mutation(third, "profile.deleteAccount", { password, confirmation: "DELETE" });
  await mutation(linkRecipient, "profile.deleteAccount", { password, confirmation: "DELETE" });
  console.log(`Native privacy, trusted-link, direct-message, deletion, username-reuse, and legacy cleanup workflow passed. Verification suffix: ${suffix}`);
} catch (error) {
  for (const client of [first, pairedBrowser, second, third, linkRecipient]) {
    if (!client.cookie) continue;
    try { await mutation(client, "profile.deleteAccount", { password: client === first ? changedPassword : password, confirmation: "DELETE" }); } catch {}
  }
  throw error;
}
