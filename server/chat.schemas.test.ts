import { describe, expect, it } from "vitest";
import {
  conversationCreateSchema,
  conversationIdSchema,
  heartbeatSchema,
  messageActionSchema,
  messageEditSchema,
  messagePinSchema,
  messageSearchSchema,
  messageSendSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  reactionToggleSchema,
  trustedConnectionRedeemSchema,
  typingStateSchema,
  disappearingMessagesSchema,
  archiveConversationSchema,
  conversationOrganizationSchema,
  recoverDeviceIdentitySchema,
  muteConversationSchema,
  deviceRegistrationSchema,
  devicePairingRequestSchema,
  devicePairingApprovalSchema,
  deviceRevokeSchema,
} from "./chatSchemas";

describe("Orbit chat input contracts", () => {
  it("normalizes an intentional message while preserving its content", () => {
    expect(messageSendSchema.parse({ conversationId: 4, body: "  Signal received.  ", replyToMessageId: 7 })).toEqual({
      conversationId: 4,
      body: "Signal received.",
      replyToMessageId: 7,
    });
  });

  it("rejects empty, oversized, and non-positive message routes", () => {
    expect(() => messageSendSchema.parse({ conversationId: 0, body: "Hello" })).toThrow();
    expect(() => messageSendSchema.parse({ conversationId: 2, body: "   " })).toThrow();
    expect(() => messageSendSchema.parse({ conversationId: 2, body: "a".repeat(24001) })).toThrow();
  });

  it("normalizes advanced message actions and constrains workspace search", () => {
    expect(messageEditSchema.parse({ messageId: 7, body: "  Revised signal. " })).toEqual({ messageId: 7, body: "Revised signal." });
    expect(messageActionSchema.parse({ messageId: 7 })).toEqual({ messageId: 7 });
    expect(messagePinSchema.parse({ messageId: 7, pinned: true })).toEqual({ messageId: 7, pinned: true });
    expect(messageSearchSchema.parse({ conversationId: 3, query: "  launch notes " })).toEqual({ conversationId: 3, query: "launch notes" });
    expect(() => messageEditSchema.parse({ messageId: 0, body: "No" })).toThrow();
    expect(() => messageSearchSchema.parse({ conversationId: 3, query: "x".repeat(241) })).toThrow();
  });

  it("accepts a concise room name and rejects blank room names", () => {
    expect(conversationCreateSchema.parse({ name: "  Lighthouse ideas " }).name).toBe("Lighthouse ideas");
    expect(() => conversationCreateSchema.parse({ name: "\n\t " })).toThrow();
  });

  it("requires valid ids and compact reaction glyphs", () => {
    expect(conversationIdSchema.parse({ conversationId: 9 })).toEqual({ conversationId: 9 });
    expect(reactionToggleSchema.parse({ messageId: 12, emoji: " ✦ " })).toEqual({ messageId: 12, emoji: "✦" });
    expect(() => reactionToggleSchema.parse({ messageId: -1, emoji: "✦" })).toThrow();
    expect(() => reactionToggleSchema.parse({ messageId: 12, emoji: "" })).toThrow();
  });

  it("normalizes a complete profile update and protects color format", () => {
    expect(profileUpdateSchema.parse({ name: "  Mina ", statusText: "  In the conversation ", avatarColor: "#BCEBD6" })).toEqual({
      name: "Mina",
      statusText: "In the conversation",
      avatarColor: "#BCEBD6",
    });
    expect(() => profileUpdateSchema.parse({ name: "Mina", statusText: "Available", avatarColor: "teal" })).toThrow();
  });

  it("validates heartbeat and typing activity state", () => {
    expect(heartbeatSchema.parse({ activeConversationId: 4 })).toEqual({ activeConversationId: 4 });
    expect(typingStateSchema.parse({ conversationId: 4, isTyping: true })).toEqual({ conversationId: 4, isTyping: true });
    expect(() => heartbeatSchema.parse({ activeConversationId: -2 })).toThrow();
    expect(() => typingStateSchema.parse({ conversationId: 4, isTyping: "yes" })).toThrow();
  });

  it("validates built-in avatars and sensitive password replacement", () => {
    expect(profileUpdateSchema.parse({ name: "Mina", statusText: "Available", avatarColor: "#BCEBD6", avatarId: "orbit-100" }).avatarId).toBe("orbit-100");
    expect(() => profileUpdateSchema.parse({ name: "Mina", statusText: "Available", avatarColor: "#BCEBD6", avatarId: "uploaded-photo" })).toThrow();
    expect(passwordChangeSchema.parse({ currentPassword: "first-pass", newPassword: "next-pass" })).toEqual({ currentPassword: "first-pass", newPassword: "next-pass" });
    expect(() => passwordChangeSchema.parse({ currentPassword: "same-pass", newPassword: "same-pass" })).toThrow();
  });

  it("only permits supported expiry timers and high-entropy trusted-link tokens", () => {
    expect(disappearingMessagesSchema.parse({ conversationId: 8, duration: 86400 })).toEqual({ conversationId: 8, duration: 86400 });
    expect(() => disappearingMessagesSchema.parse({ conversationId: 8, duration: 90 })).toThrow();
    expect(trustedConnectionRedeemSchema.parse({ token: "A".repeat(43) }).token).toHaveLength(43);
    expect(() => trustedConnectionRedeemSchema.parse({ token: "short-token" })).toThrow();
  });

  it("constrains personal mute and archive controls to safe direct-chat state", () => {
    expect(muteConversationSchema.parse({ conversationId: 8, duration: 28800 })).toEqual({ conversationId: 8, duration: 28800 });
    expect(muteConversationSchema.parse({ conversationId: 8, duration: -1 })).toEqual({ conversationId: 8, duration: -1 });
    expect(archiveConversationSchema.parse({ conversationId: 8, archived: true })).toEqual({ conversationId: 8, archived: true });
    expect(() => muteConversationSchema.parse({ conversationId: 8, duration: 90 })).toThrow();
    expect(() => archiveConversationSchema.parse({ conversationId: 8, archived: "yes" })).toThrow();
  });

  it("limits private conversation labels while allowing a favorite marker", () => {
    expect(conversationOrganizationSchema.parse({ conversationId: 8, favorite: true, label: "Weekend plans" })).toEqual({ conversationId: 8, favorite: true, label: "Weekend plans" });
    expect(conversationOrganizationSchema.parse({ conversationId: 8, favorite: false, label: null })).toEqual({ conversationId: 8, favorite: false, label: null });
    expect(() => conversationOrganizationSchema.parse({ conversationId: 8, favorite: true, label: "x".repeat(33) })).toThrow();
  });

  it("requires an explicit password-confirmed secure-device recovery request", () => {
    const key = JSON.stringify({ kty: "EC", crv: "P-256", x: "x".repeat(40), y: "y".repeat(40) });
    const signing = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "x".repeat(40) });
    expect(recoverDeviceIdentitySchema.parse({ encryptionPublicKey: key, signingPublicKey: signing, fingerprint: "A".repeat(24), currentPassword: "current-password", confirmation: "REPLACE_DEVICE_KEY" }).confirmation).toBe("REPLACE_DEVICE_KEY");
    expect(() => recoverDeviceIdentitySchema.parse({ encryptionPublicKey: key, signingPublicKey: signing, fingerprint: "A".repeat(24), currentPassword: "current-password", confirmation: "replace" })).toThrow();
  });

  it("accepts only well-formed secure-device registrations and one-time pairing requests", () => {
    const encryptionPublicKey = JSON.stringify({ kty: "EC", crv: "P-256", x: "x".repeat(40), y: "y".repeat(40) });
    const signingPublicKey = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "x".repeat(40) });
    const registration = { deviceId: `device-${"A".repeat(24)}`, label: "Laptop browser", encryptionPublicKey, signingPublicKey, fingerprint: "A".repeat(24) };
    expect(deviceRegistrationSchema.parse(registration)).toMatchObject({ label: "Laptop browser", fingerprint: "A".repeat(24) });
    expect(devicePairingRequestSchema.parse({ ...registration, token: "B".repeat(43) }).token).toHaveLength(43);
    expect(() => deviceRegistrationSchema.parse({ ...registration, deviceId: "browser-unsafe" })).toThrow();
    expect(() => devicePairingRequestSchema.parse({ ...registration, token: "short" })).toThrow();
  });

  it("requires an explicit, positive pairing approval decision and a valid device id for revocation", () => {
    expect(devicePairingApprovalSchema.parse({ pairingId: 4, approve: true })).toEqual({ pairingId: 4, approve: true });
    expect(deviceRevokeSchema.parse({ deviceId: `device-${"C".repeat(24)}` }).deviceId).toContain("device-");
    expect(() => devicePairingApprovalSchema.parse({ pairingId: 0, approve: true })).toThrow();
    expect(() => devicePairingApprovalSchema.parse({ pairingId: 4, approve: "yes" })).toThrow();
    expect(() => deviceRevokeSchema.parse({ deviceId: "device-short" })).toThrow();
  });
});
