import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the application authentication flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 32 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  statusText: varchar("statusText", { length: 120 }).default("Available").notNull(),
  avatarColor: varchar("avatarColor", { length: 16 }).default("#DFF2C5").notNull(),
  avatarId: varchar("avatarId", { length: 24 }).default("orbit-01").notNull(),
  encryptionPublicKey: text("encryptionPublicKey"),
  signingPublicKey: text("signingPublicKey"),
  encryptionFingerprint: varchar("encryptionFingerprint", { length: 32 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["group", "direct"]).default("group").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  disappearingDuration: int("disappearingDuration").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  updatedAtIdx: index("conversations_updated_at_idx").on(table.updatedAt),
}));

export const conversationMembers = mysqlTable("conversation_members", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("member").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  lastReadMessageId: int("lastReadMessageId"),
  mutedUntil: timestamp("mutedUntil"),
  mutedForever: int("mutedForever").default(0).notNull(),
  archivedAt: timestamp("archivedAt"),
  isFavorite: int("isFavorite").default(0).notNull(),
  personalLabel: varchar("personalLabel", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  memberUserIdx: index("conversation_members_user_idx").on(table.userId),
  conversationIdx: index("conversation_members_conversation_idx").on(table.conversationId),
  conversationUserUnique: uniqueIndex("conversation_members_conversation_user_unique").on(table.conversationId, table.userId),
}));

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  body: text("body").notNull(),
  replyToId: int("replyToId"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  attachmentUrl: text("attachmentUrl"),
  attachmentMime: varchar("attachmentMime", { length: 120 }),
  editedAt: timestamp("editedAt"),
  deletedAt: timestamp("deletedAt"),
  pinnedAt: timestamp("pinnedAt"),
  pinnedBy: int("pinnedBy"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  conversationCreatedAtIdx: index("messages_conversation_created_at_idx").on(table.conversationId, table.createdAt),
  conversationPinnedAtIdx: index("messages_conversation_pinned_at_idx").on(table.conversationId, table.pinnedAt),
  replyToIdx: index("messages_reply_to_idx").on(table.replyToId),
  senderIdx: index("messages_sender_idx").on(table.senderId),
  expiresAtIdx: index("messages_expires_at_idx").on(table.expiresAt),
}));

export const messageReactions = mysqlTable("message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  messageIdx: index("message_reactions_message_idx").on(table.messageId),
  messageUserEmojiUnique: uniqueIndex("message_reactions_message_user_emoji_unique").on(table.messageId, table.userId, table.emoji),
}));

export const messageSaves = mysqlTable("message_saves", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  userCreatedAtIdx: index("message_saves_user_created_at_idx").on(table.userId, table.createdAt),
  messageUserUnique: uniqueIndex("message_saves_message_user_unique").on(table.messageId, table.userId),
}));

export const userPresence = mysqlTable("user_presence", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  state: mysqlEnum("state", ["online", "away", "offline"]).default("online").notNull(),
  activeConversationId: int("activeConversationId"),
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userUnique: uniqueIndex("user_presence_user_unique").on(table.userId),
  activeConversationIdx: index("user_presence_conversation_idx").on(table.activeConversationId),
}));

export const typingIndicators = mysqlTable("typing_indicators", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  conversationIdx: index("typing_indicators_conversation_idx").on(table.conversationId),
  conversationUserUnique: uniqueIndex("typing_indicators_conversation_user_unique").on(table.conversationId, table.userId),
}));

export const contactRequests = mysqlTable("contact_requests", {
  id: int("id").autoincrement().primaryKey(),
  requesterId: int("requesterId").notNull(),
  recipientId: int("recipientId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  requesterIdx: index("contact_requests_requester_idx").on(table.requesterId, table.status),
  recipientIdx: index("contact_requests_recipient_idx").on(table.recipientId, table.status),
  pairUnique: uniqueIndex("contact_requests_pair_unique").on(table.requesterId, table.recipientId),
}));

export const conversationHistoryClears = mysqlTable("conversation_history_clears", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  clearedAt: timestamp("clearedAt").defaultNow().notNull(),
}, table => ({
  conversationUserUnique: uniqueIndex("conversation_history_clears_conversation_user_unique").on(table.conversationId, table.userId),
  userIdx: index("conversation_history_clears_user_idx").on(table.userId),
}));

export const trustedConnectionLinks = mysqlTable("trusted_connection_links", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  redeemedAt: timestamp("redeemedAt"),
  redeemedBy: int("redeemedBy"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  tokenUnique: uniqueIndex("trusted_connection_links_token_hash_unique").on(table.tokenHash),
  creatorIdx: index("trusted_connection_links_creator_idx").on(table.creatorId, table.createdAt),
  expiresAtIdx: index("trusted_connection_links_expires_at_idx").on(table.expiresAt),
}));

export const secureDevices = mysqlTable("secure_devices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  encryptionPublicKey: text("encryptionPublicKey").notNull(),
  signingPublicKey: text("signingPublicKey").notNull(),
  fingerprint: varchar("fingerprint", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["active", "pending", "revoked"]).default("pending").notNull(),
  pairedAt: timestamp("pairedAt"),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  userStatusIdx: index("secure_devices_user_status_idx").on(table.userId, table.status),
  userDeviceUnique: uniqueIndex("secure_devices_user_device_unique").on(table.userId, table.deviceId),
  fingerprintIdx: index("secure_devices_fingerprint_idx").on(table.fingerprint),
}));

export const secureDevicePairings = mysqlTable("secure_device_pairings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  creatorDeviceId: varchar("creatorDeviceId", { length: 64 }).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 64 }),
  targetLabel: varchar("targetLabel", { length: 80 }),
  targetEncryptionPublicKey: text("targetEncryptionPublicKey"),
  targetSigningPublicKey: text("targetSigningPublicKey"),
  targetFingerprint: varchar("targetFingerprint", { length: 32 }),
  status: mysqlEnum("status", ["open", "pending", "approved", "rejected", "expired", "revoked"]).default("open").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  tokenUnique: uniqueIndex("secure_device_pairings_token_hash_unique").on(table.tokenHash),
  userStatusIdx: index("secure_device_pairings_user_status_idx").on(table.userId, table.status),
  expiresAtIdx: index("secure_device_pairings_expires_at_idx").on(table.expiresAt),
}));

export const secureDeviceKeyHistory = mysqlTable("secure_device_key_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 32 }).notNull(),
  encryptionPublicKey: text("encryptionPublicKey").notNull(),
  signingPublicKey: text("signingPublicKey").notNull(),
  event: mysqlEnum("event", ["registered", "paired", "recovered", "revoked"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  userCreatedIdx: index("secure_device_key_history_user_created_idx").on(table.userId, table.createdAt),
  deviceIdx: index("secure_device_key_history_device_idx").on(table.deviceId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;
