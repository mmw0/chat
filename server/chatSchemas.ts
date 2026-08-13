import { z } from "zod";
import { muteDurationValues } from "../shared/conversationControls";
import { E2EE_ENVELOPE_PATTERN } from "../shared/e2ee";

export const conversationIdSchema = z.object({
  conversationId: z.number().int().positive(),
});

export const conversationCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
});

export const messageSendSchema = conversationIdSchema.extend({
  body: z.string().trim().min(1).max(24000),
  replyToMessageId: z.number().int().positive().optional(),
});

export const messageEditSchema = z.object({
  messageId: z.number().int().positive(),
  body: z.string().trim().min(1).max(24000),
});

export const deviceIdentitySchema = z.object({
  encryptionPublicKey: z.string().min(40).max(1800).refine(value => { try { const key = JSON.parse(value) as JsonWebKey; return key.kty === "EC" && key.crv === "P-256"; } catch { return false; } }, "A valid P-256 public key is required."),
  signingPublicKey: z.string().min(40).max(1800).refine(value => { try { const key = JSON.parse(value) as JsonWebKey; return key.kty === "OKP" && key.crv === "Ed25519"; } catch { return false; } }, "A valid Ed25519 public key is required."),
  fingerprint: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
});

export const recoverDeviceIdentitySchema = deviceIdentitySchema.extend({
  currentPassword: z.string().min(8).max(128),
  confirmation: z.literal("REPLACE_DEVICE_KEY"),
});

export const deviceRegistrationSchema = deviceIdentitySchema.extend({
  deviceId: z.string().regex(/^device-[A-Za-z0-9_-]{16,32}$/),
  label: z.string().trim().min(1).max(80),
});

export const devicePairingRequestSchema = deviceRegistrationSchema.extend({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export const devicePairingApprovalSchema = z.object({ pairingId: z.number().int().positive(), approve: z.boolean() });
export const deviceRevokeSchema = z.object({ deviceId: z.string().regex(/^device-[A-Za-z0-9_-]{16,32}$/) });

export function requiresEncryptedEnvelope(value: string) {
  return E2EE_ENVELOPE_PATTERN.test(value);
}

export const messageActionSchema = z.object({
  messageId: z.number().int().positive(),
});

export const messagePinSchema = messageActionSchema.extend({
  pinned: z.boolean(),
});

export const messageSearchSchema = conversationIdSchema.extend({
  query: z.string().trim().max(240).default(""),
});

export const reactionToggleSchema = z.object({
  messageId: z.number().int().positive(),
  emoji: z.string().trim().min(1).max(32),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  statusText: z.string().trim().min(1).max(120),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  avatarId: z.string().regex(/^orbit-(0[1-9]|[1-9][0-9]|100)$/).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
}).refine(value => value.currentPassword !== value.newPassword, {
  message: "Choose a new password that differs from your current password.",
  path: ["newPassword"],
});

export const trustedConnectionRedeemSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export const disappearingMessagesSchema = conversationIdSchema.extend({
  duration: z.union([z.literal(0), z.literal(3600), z.literal(86400), z.literal(604800), z.literal(2592000)]),
});

export const muteConversationSchema = conversationIdSchema.extend({
  duration: z.union(muteDurationValues.map(value => z.literal(value)) as [z.ZodLiteral<0>, z.ZodLiteral<3600>, z.ZodLiteral<28800>, z.ZodLiteral<86400>, z.ZodLiteral<-1>]),
});

export const archiveConversationSchema = conversationIdSchema.extend({
  archived: z.boolean(),
});

export const conversationOrganizationSchema = conversationIdSchema.extend({
  favorite: z.boolean(),
  label: z.string().trim().max(32).nullable(),
});

export const heartbeatSchema = z.object({
  activeConversationId: z.number().int().positive().optional(),
});

export const typingStateSchema = conversationIdSchema.extend({
  isTyping: z.boolean(),
});
