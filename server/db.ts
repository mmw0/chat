import { and, count, desc, eq, gt, inArray, like, ne, or } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  contactRequests,
  conversationHistoryClears,
  conversations,
  conversationMembers,
  InsertUser,
  messageReactions,
  messageSaves,
  messages,
  secureDeviceKeyHistory,
  secureDevicePairings,
  secureDevices,
  trustedConnectionLinks,
  typingIndicators,
  userPresence,
  User,
  users,
} from "../drizzle/schema";
import { getDirectConversationError, getInvitationError } from "./chatPolicy";
import { canCancelRequest, canRespondToRequest, getRequestSendAction } from "./contactPolicy";
import { getAdvancedMessageActionError } from "./advancedMessagePolicy";
import { ENV } from "./_core/env";
import { getMutePreference, type MuteDuration } from "../shared/conversationControls";
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function publishDeviceIdentity(userId: number, input: { encryptionPublicKey: string; signingPublicKey: string; fingerprint: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await getUserById(userId);
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (existing.encryptionPublicKey && (existing.encryptionPublicKey !== input.encryptionPublicKey || existing.signingPublicKey !== input.signingPublicKey)) throw new Error("DEVICE_KEY_MISMATCH");
  await db.update(users).set({ encryptionPublicKey: input.encryptionPublicKey, signingPublicKey: input.signingPublicKey, encryptionFingerprint: input.fingerprint }).where(eq(users.id, userId));
  return { fingerprint: input.fingerprint };
}

export async function replaceDeviceIdentity(userId: number, input: { encryptionPublicKey: string; signingPublicKey: string; fingerprint: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ encryptionPublicKey: input.encryptionPublicKey, signingPublicKey: input.signingPublicKey, encryptionFingerprint: input.fingerprint }).where(eq(users.id, userId));
  return { fingerprint: input.fingerprint };
}

function deviceIdForFingerprint(fingerprint: string) {
  return `device-${fingerprint}`;
}

export async function syncSecureDevice(userId: number, input: { encryptionPublicKey: string; signingPublicKey: string; fingerprint: string; label?: string; event?: "registered" | "recovered" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const deviceId = deviceIdForFingerprint(input.fingerprint);
  const existing = await db.select().from(secureDevices).where(and(eq(secureDevices.userId, userId), eq(secureDevices.deviceId, deviceId))).limit(1);
  if (existing[0]) await db.update(secureDevices).set({ lastSeenAt: new Date(), status: "active", revokedAt: null, encryptionPublicKey: input.encryptionPublicKey, signingPublicKey: input.signingPublicKey, fingerprint: input.fingerprint }).where(eq(secureDevices.id, existing[0].id));
  else await db.insert(secureDevices).values({ userId, deviceId, label: input.label || "This device", encryptionPublicKey: input.encryptionPublicKey, signingPublicKey: input.signingPublicKey, fingerprint: input.fingerprint, status: "active", pairedAt: new Date() });
  await db.insert(secureDeviceKeyHistory).values({ userId, deviceId, fingerprint: input.fingerprint, encryptionPublicKey: input.encryptionPublicKey, signingPublicKey: input.signingPublicKey, event: input.event || "registered" });
  return { deviceId };
}

export async function listSecureDevices(userId: number) {
  const db = await getDb();
  if (!db) return { devices: [], history: [], pairings: [] };
  const devices = await db.select().from(secureDevices).where(eq(secureDevices.userId, userId)).orderBy(desc(secureDevices.lastSeenAt));
  const history = await db.select().from(secureDeviceKeyHistory).where(eq(secureDeviceKeyHistory.userId, userId)).orderBy(desc(secureDeviceKeyHistory.createdAt)).limit(24);
  const pairings = await db.select().from(secureDevicePairings).where(eq(secureDevicePairings.userId, userId)).orderBy(desc(secureDevicePairings.createdAt)).limit(12);
  return { devices, history, pairings };
}

export async function createSecureDevicePairing(userId: number, fingerprint: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(secureDevicePairings).values({ userId, tokenHash, creatorDeviceId: deviceIdForFingerprint(fingerprint), expiresAt });
  return { token, expiresAt };
}

export async function requestSecureDevicePairing(userId: number, input: { token: string; deviceId: string; label: string; encryptionPublicKey: string; signingPublicKey: string; fingerprint: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const pairing = await db.select().from(secureDevicePairings).where(eq(secureDevicePairings.tokenHash, tokenHash)).limit(1);
  const row = pairing[0];
  if (!row || row.userId !== userId || row.status !== "open" || row.expiresAt <= new Date()) throw new Error("PAIRING_UNAVAILABLE");
  await db.update(secureDevicePairings).set({ status: "pending", targetDeviceId: input.deviceId, targetLabel: input.label, targetEncryptionPublicKey: input.encryptionPublicKey, targetSigningPublicKey: input.signingPublicKey, targetFingerprint: input.fingerprint }).where(eq(secureDevicePairings.id, row.id));
  return { pending: true };
}

export async function approveSecureDevicePairing(userId: number, pairingId: number, approve: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const pairing = await db.select().from(secureDevicePairings).where(and(eq(secureDevicePairings.id, pairingId), eq(secureDevicePairings.userId, userId))).limit(1);
  const row = pairing[0];
  if (!row || row.status !== "pending" || !row.targetDeviceId || !row.targetEncryptionPublicKey || !row.targetSigningPublicKey || !row.targetFingerprint) throw new Error("PAIRING_UNAVAILABLE");
  if (!approve) { await db.update(secureDevicePairings).set({ status: "rejected" }).where(eq(secureDevicePairings.id, row.id)); return { approved: false }; }
  await db.insert(secureDevices).values({ userId, deviceId: row.targetDeviceId, label: row.targetLabel || "Paired device", encryptionPublicKey: row.targetEncryptionPublicKey, signingPublicKey: row.targetSigningPublicKey, fingerprint: row.targetFingerprint, status: "active", pairedAt: new Date() });
  await db.insert(secureDeviceKeyHistory).values({ userId, deviceId: row.targetDeviceId, fingerprint: row.targetFingerprint, encryptionPublicKey: row.targetEncryptionPublicKey, signingPublicKey: row.targetSigningPublicKey, event: "paired" });
  await db.update(secureDevicePairings).set({ status: "approved", approvedAt: new Date() }).where(eq(secureDevicePairings.id, row.id));
  return { approved: true };
}

export async function revokeSecureDevice(userId: number, deviceId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const device = await db.select().from(secureDevices).where(and(eq(secureDevices.userId, userId), eq(secureDevices.deviceId, deviceId))).limit(1);
  if (!device[0] || device[0].status === "revoked") throw new Error("DEVICE_NOT_AVAILABLE");
  const activeDevices = await db.select({ id: secureDevices.id }).from(secureDevices).where(and(eq(secureDevices.userId, userId), eq(secureDevices.status, "active")));
  if (activeDevices.length <= 1) throw new Error("LAST_DEVICE_PROTECTED");
  await db.update(secureDevices).set({ status: "revoked", revokedAt: new Date() }).where(eq(secureDevices.id, device[0].id));
  await db.insert(secureDeviceKeyHistory).values({ userId, deviceId, fingerprint: device[0].fingerprint, encryptionPublicKey: device[0].encryptionPublicKey, signingPublicKey: device[0].signingPublicKey, event: "revoked" });
  return { success: true };
}

export async function createNativeUser(input: { username: string; passwordHash: string }): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await getUserByUsername(input.username);
  if (existing) throw new Error("USERNAME_TAKEN");

  await db.insert(users).values({
    openId: `native:${input.username}`,
    username: input.username,
    passwordHash: input.passwordHash,
    name: input.username,
    loginMethod: "password",
  });
  const user = await getUserByUsername(input.username);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function updateUserProfile(userId: number, input: { name: string; statusText: string; avatarColor: string; avatarId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set(input).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function deleteUserPermanently(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const directMemberships = await db.select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversationMembers.userId, userId), eq(conversations.kind, "direct")));
  const directConversationIds = directMemberships.map(row => row.conversationId);
  const ownedGroupConversations = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.createdBy, userId), eq(conversations.kind, "group")));

  if (directConversationIds.length) {
    const directMessages = await db.select({ id: messages.id }).from(messages).where(inArray(messages.conversationId, directConversationIds));
    const directMessageIds = directMessages.map(message => message.id);
    if (directMessageIds.length) {
      await db.delete(messageReactions).where(inArray(messageReactions.messageId, directMessageIds));
      await db.delete(messageSaves).where(inArray(messageSaves.messageId, directMessageIds));
    }
    await db.delete(typingIndicators).where(inArray(typingIndicators.conversationId, directConversationIds));
    await db.delete(conversationHistoryClears).where(inArray(conversationHistoryClears.conversationId, directConversationIds));
    await db.delete(messages).where(inArray(messages.conversationId, directConversationIds));
    await db.delete(conversationMembers).where(inArray(conversationMembers.conversationId, directConversationIds));
    await db.delete(conversations).where(inArray(conversations.id, directConversationIds));
  }

  const authoredMessages = await db.select({ id: messages.id }).from(messages).where(eq(messages.senderId, userId));
  const authoredMessageIds = authoredMessages.map(message => message.id);
  if (authoredMessageIds.length) {
    await db.delete(messageReactions).where(inArray(messageReactions.messageId, authoredMessageIds));
    await db.delete(messageSaves).where(inArray(messageSaves.messageId, authoredMessageIds));
  }
  await db.delete(messageReactions).where(eq(messageReactions.userId, userId));
  await db.delete(messageSaves).where(eq(messageSaves.userId, userId));
  await db.delete(messages).where(eq(messages.senderId, userId));
  await db.delete(typingIndicators).where(eq(typingIndicators.userId, userId));
  await db.delete(userPresence).where(eq(userPresence.userId, userId));
  await db.delete(conversationHistoryClears).where(eq(conversationHistoryClears.userId, userId));
  await db.delete(trustedConnectionLinks).where(or(eq(trustedConnectionLinks.creatorId, userId), eq(trustedConnectionLinks.redeemedBy, userId)));
  await db.delete(contactRequests).where(or(eq(contactRequests.requesterId, userId), eq(contactRequests.recipientId, userId)));
  await db.delete(conversationMembers).where(eq(conversationMembers.userId, userId));

  for (const conversation of ownedGroupConversations) {
    const remainingMember = await db.select({ id: conversationMembers.id }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversation.id)).limit(1);
    if (remainingMember[0]) continue;
    const orphanMessages = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversation.id));
    const orphanMessageIds = orphanMessages.map(message => message.id);
    if (orphanMessageIds.length) {
      await db.delete(messageReactions).where(inArray(messageReactions.messageId, orphanMessageIds));
      await db.delete(messageSaves).where(inArray(messageSaves.messageId, orphanMessageIds));
    }
    await db.delete(typingIndicators).where(eq(typingIndicators.conversationId, conversation.id));
    await db.delete(messages).where(eq(messages.conversationId, conversation.id));
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
  }
  await db.delete(users).where(eq(users.id, userId));
}

export async function searchUsersByUsername(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const candidates = await db.select({ id: users.id, username: users.username, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor, avatarId: users.avatarId })
    .from(users).where(and(ne(users.id, userId), like(users.username, `%${normalized}%`))).limit(12);
  return Promise.all(candidates.map(async candidate => {
    const request = await getContactRequestBetween(userId, candidate.id);
    return {
      ...candidate,
      requestId: request?.id ?? null,
      relationship: request?.status === "pending" && request.requesterId !== userId ? "incoming" : request?.status ?? null,
      direction: request ? (request.requesterId === userId ? "outgoing" : "incoming") : null,
      conversationId: request?.status === "accepted" ? await findExistingDirectConversation(userId, candidate.id) : null,
    };
  }));
}

export async function getContactRequestBetween(firstUserId: number, secondUserId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactRequests).where(or(
    and(eq(contactRequests.requesterId, firstUserId), eq(contactRequests.recipientId, secondUserId)),
    and(eq(contactRequests.requesterId, secondUserId), eq(contactRequests.recipientId, firstUserId)),
  )).orderBy(desc(contactRequests.updatedAt)).limit(1);
  return result[0];
}

export async function sendContactRequest(requesterId: number, recipientUsername: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const recipient = await getUserByUsername(recipientUsername);
  if (!recipient) throw new Error("USER_NOT_FOUND");
  const outgoing = await db.select().from(contactRequests).where(and(eq(contactRequests.requesterId, requesterId), eq(contactRequests.recipientId, recipient.id))).limit(1);
  const action = getRequestSendAction({ requesterId, recipientId: recipient.id, existingStatus: outgoing[0]?.status });
  if (action === "self") throw new Error("SELF_REQUEST");
  if (action === "pending") return { status: "pending" as const, recipient };
  if (action === "accepted") return { status: "accepted" as const, recipient };
  if (outgoing[0]) await db.update(contactRequests).set({ status: "pending" }).where(eq(contactRequests.id, outgoing[0].id));
  else await db.insert(contactRequests).values({ requesterId, recipientId: recipient.id, status: "pending" });
  return { status: "sent" as const, recipient };
}

export async function listContactRequests(userId: number) {
  const db = await getDb();
  if (!db) return { incoming: [], outgoing: [] };
  const incoming = await db.select({ request: contactRequests, user: { id: users.id, username: users.username, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor, avatarId: users.avatarId } })
    .from(contactRequests).innerJoin(users, eq(contactRequests.requesterId, users.id))
    .where(and(eq(contactRequests.recipientId, userId), eq(contactRequests.status, "pending"))).orderBy(desc(contactRequests.updatedAt));
  const outgoing = await db.select({ request: contactRequests, user: { id: users.id, username: users.username, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor, avatarId: users.avatarId } })
    .from(contactRequests).innerJoin(users, eq(contactRequests.recipientId, users.id))
    .where(and(eq(contactRequests.requesterId, userId), eq(contactRequests.status, "pending"))).orderBy(desc(contactRequests.updatedAt));
  return { incoming, outgoing };
}

export async function findExistingDirectConversation(userId: number, participantId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const candidates = await db.select({ id: conversations.id }).from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversationMembers.userId, userId), eq(conversations.kind, "direct")));
  for (const candidate of candidates) {
    const participant = await db.select({ id: conversationMembers.id }).from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, candidate.id), eq(conversationMembers.userId, participantId))).limit(1);
    if (participant[0]) return candidate.id;
  }
  return undefined;
}

export async function respondToContactRequest(recipientId: number, requestId: number, accept: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const request = await db.select().from(contactRequests).where(eq(contactRequests.id, requestId)).limit(1);
  if (!request[0] || !canRespondToRequest({ requesterId: request[0].requesterId, recipientId: request[0].recipientId, actorId: recipientId, status: request[0].status })) throw new Error("REQUEST_NOT_AVAILABLE");
  await db.update(contactRequests).set({ status: accept ? "accepted" : "declined" }).where(eq(contactRequests.id, requestId));
  return accept ? { status: "accepted" as const, conversationId: await createDirectConversation(request[0].requesterId, recipientId) } : { status: "declined" as const };
}

export async function cancelContactRequest(requesterId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const request = await db.select().from(contactRequests).where(eq(contactRequests.id, requestId)).limit(1);
  if (!request[0] || !canCancelRequest({ requesterId: request[0].requesterId, actorId: requesterId, status: request[0].status })) throw new Error("REQUEST_NOT_AVAILABLE");
  await db.update(contactRequests).set({ status: "cancelled" }).where(eq(contactRequests.id, requestId));
  return { status: "cancelled" as const };
}

export async function listContactsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const accepted = await db.select().from(contactRequests).where(and(or(eq(contactRequests.requesterId, userId), eq(contactRequests.recipientId, userId)), eq(contactRequests.status, "accepted")));
  const contacts = await Promise.all(accepted.map(async request => {
    const contactId = request.requesterId === userId ? request.recipientId : request.requesterId;
    const contact = await db.select({ id: users.id, username: users.username, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor, avatarId: users.avatarId, encryptionPublicKey: users.encryptionPublicKey, signingPublicKey: users.signingPublicKey, encryptionFingerprint: users.encryptionFingerprint }).from(users).where(eq(users.id, contactId)).limit(1);
    if (!contact[0]) return null;
    const conversationId = await findExistingDirectConversation(userId, contactId);
    const state = conversationId
      ? await db.select({ mutedUntil: conversationMembers.mutedUntil, mutedForever: conversationMembers.mutedForever, archivedAt: conversationMembers.archivedAt, isFavorite: conversationMembers.isFavorite, personalLabel: conversationMembers.personalLabel })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)))
        .limit(1)
      : [];
    return {
      ...contact[0],
      conversationId,
      mutedUntil: state[0]?.mutedUntil ?? null,
      mutedForever: Boolean(state[0]?.mutedForever),
      archivedAt: state[0]?.archivedAt ?? null,
      isFavorite: Boolean(state[0]?.isFavorite),
      personalLabel: state[0]?.personalLabel ?? null,
    };
  }));
  return contacts.filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
}

export async function getDirectPeer(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversation = await db.select({ kind: conversations.kind }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (conversation[0]?.kind !== "direct") return undefined;
  const peer = await db.select({ id: users.id }).from(conversationMembers).innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, userId))).limit(1);
  return peer[0]?.id;
}

export async function areAcceptedContacts(firstUserId: number, secondUserId: number) {
  const request = await getContactRequestBetween(firstUserId, secondUserId);
  return request?.status === "accepted";
}

export async function ensurePersonalOrbit(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select({ id: conversationMembers.id }).from(conversationMembers).where(eq(conversationMembers.userId, userId)).limit(1);
  if (existing.length > 0) return;

  const result = await db.insert(conversations).values({
    kind: "group",
    name: "My orbit",
    description: "A private place to begin.",
    createdBy: userId,
  });
  const conversationId = Number(result[0].insertId);
  await db.insert(conversationMembers).values({ conversationId, userId, role: "owner", lastReadAt: new Date() });
  return conversationId;
}

export async function listConversationsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({ conversation: conversations, membership: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(eq(conversationMembers.userId, userId))
    .orderBy(desc(conversations.updatedAt));

  return Promise.all(result.map(async ({ conversation, membership }) => {
    const lastMessage = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(1);
    const unreadWhere = membership.lastReadMessageId !== null
      ? and(eq(messages.conversationId, conversation.id), ne(messages.senderId, userId), gt(messages.id, membership.lastReadMessageId))
      : membership.lastReadAt
        ? and(eq(messages.conversationId, conversation.id), ne(messages.senderId, userId), gt(messages.createdAt, membership.lastReadAt))
        : and(eq(messages.conversationId, conversation.id), ne(messages.senderId, userId));
    const unreadResult = await db.select({ total: count() }).from(messages).where(unreadWhere);
    return { ...conversation, lastMessage: lastMessage[0] ?? null, unread: Number(unreadResult[0]?.total ?? 0) };
  }));
}

export async function createConversationForUser(userId: number, input: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.insert(conversations).values({
    kind: "group",
    name: input.name,
    description: input.description ?? null,
    createdBy: userId,
  });
  const conversationId = Number(result[0].insertId);
  await db.insert(conversationMembers).values({ conversationId, userId, role: "owner", lastReadAt: new Date() });
  return conversationId;
}

export async function findPeopleForInvite(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = query.trim();
  const where = normalized
    ? and(ne(users.id, userId), like(users.name, `%${normalized}%`))
    : ne(users.id, userId);
  return db.select({ id: users.id, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor }).from(users).where(where).limit(8);
}

export async function createDirectConversation(userId: number, participantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const directError = getDirectConversationError(userId, participantId);
  if (directError) throw new Error(directError);
  const candidateConversations = await db
    .select({ id: conversations.id })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversationMembers.userId, userId), eq(conversations.kind, "direct")));

  for (const candidate of candidateConversations) {
    const participant = await db.select({ id: conversationMembers.id }).from(conversationMembers).where(and(eq(conversationMembers.conversationId, candidate.id), eq(conversationMembers.userId, participantId))).limit(1);
    if (participant[0]) return candidate.id;
  }

  const recipient = await db.select({ name: users.name }).from(users).where(eq(users.id, participantId)).limit(1);
  if (!recipient[0]) throw new Error("Person not found");
  const result = await db.insert(conversations).values({ kind: "direct", name: recipient[0].name || "Direct message", description: "A private signal.", createdBy: userId });
  const conversationId = Number(result[0].insertId);
  await db.insert(conversationMembers).values([
    { conversationId, userId, role: "owner", lastReadAt: new Date() },
    { conversationId, userId: participantId, role: "member" },
  ]);
  return conversationId;
}

function hashTrustedConnectionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createTrustedConnectionLink(creatorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(trustedConnectionLinks).values({ creatorId, tokenHash: hashTrustedConnectionToken(token), expiresAt });
  return { token, expiresAt };
}

export async function listTrustedConnectionLinks(creatorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: trustedConnectionLinks.id, expiresAt: trustedConnectionLinks.expiresAt, redeemedAt: trustedConnectionLinks.redeemedAt, revokedAt: trustedConnectionLinks.revokedAt, createdAt: trustedConnectionLinks.createdAt })
    .from(trustedConnectionLinks).where(eq(trustedConnectionLinks.creatorId, creatorId)).orderBy(desc(trustedConnectionLinks.createdAt)).limit(8);
}

export async function revokeTrustedConnectionLink(creatorId: number, linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.update(trustedConnectionLinks).set({ revokedAt: new Date() })
    .where(and(eq(trustedConnectionLinks.id, linkId), eq(trustedConnectionLinks.creatorId, creatorId), isNull(trustedConnectionLinks.redeemedAt), isNull(trustedConnectionLinks.revokedAt)));
  if (!Number(result[0]?.affectedRows)) throw new Error("LINK_NOT_AVAILABLE");
}

export async function redeemTrustedConnectionLink(redeemerId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  const link = await db.select().from(trustedConnectionLinks).where(eq(trustedConnectionLinks.tokenHash, hashTrustedConnectionToken(token))).limit(1);
  if (!link[0] || link[0].creatorId === redeemerId || link[0].redeemedAt || link[0].revokedAt || link[0].expiresAt <= now) throw new Error("LINK_NOT_AVAILABLE");
  const useResult = await db.update(trustedConnectionLinks).set({ redeemedAt: now, redeemedBy: redeemerId })
    .where(and(eq(trustedConnectionLinks.id, link[0].id), isNull(trustedConnectionLinks.redeemedAt), isNull(trustedConnectionLinks.revokedAt), gt(trustedConnectionLinks.expiresAt, now)));
  if (!Number(useResult[0]?.affectedRows)) throw new Error("LINK_NOT_AVAILABLE");
  const existing = await getContactRequestBetween(link[0].creatorId, redeemerId);
  if (!existing) await db.insert(contactRequests).values({ requesterId: link[0].creatorId, recipientId: redeemerId, status: "accepted" });
  else if (existing.status !== "accepted") await db.update(contactRequests).set({ status: "accepted" }).where(eq(contactRequests.id, existing.id));
  const conversationId = await createDirectConversation(link[0].creatorId, redeemerId);
  return { conversationId, creatorId: link[0].creatorId };
}

export async function inviteMemberToConversation(ownerId: number, conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const conversation = await db.select({ kind: conversations.kind, createdBy: conversations.createdBy }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const invitationError = getInvitationError({ ownerId, recipientId: userId, conversation: conversation[0] });
  if (invitationError) throw new Error(invitationError);
  const recipient = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!recipient[0]) throw new Error("Person not found.");
  const existing = await db.select({ id: conversationMembers.id }).from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))).limit(1);
  if (existing[0]) return "already-member" as const;
  await db.insert(conversationMembers).values({ conversationId, userId, role: "member" });
  return "invited" as const;
}

export async function getConversationForMember(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ conversation: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)))
    .limit(1);
  return result[0]?.conversation;
}

export async function listMessagesForConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  const clear = await db.select({ clearedAt: conversationHistoryClears.clearedAt }).from(conversationHistoryClears)
    .where(and(eq(conversationHistoryClears.conversationId, conversationId), eq(conversationHistoryClears.userId, userId))).limit(1);
  const visibleWhere = clear[0]
    ? and(eq(messages.conversationId, conversationId), or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())), gt(messages.createdAt, clear[0].clearedAt))
    : and(eq(messages.conversationId, conversationId), or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())));
  const result = await db
    .select({ message: messages, sender: { id: users.id, name: users.name, username: users.username, encryptionPublicKey: users.encryptionPublicKey, signingPublicKey: users.signingPublicKey } })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(visibleWhere)
    .orderBy(messages.createdAt);
  const ids = result.map(row => row.message.id);
  const reactions = ids.length ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids)) : [];
  const saves = ids.length
    ? await db.select({ messageId: messageSaves.messageId }).from(messageSaves).where(and(eq(messageSaves.userId, userId), inArray(messageSaves.messageId, ids)))
    : [];
  const savedIds = new Set(saves.map(save => save.messageId));
  const visibleMessages = new Map(result.map(row => [row.message.id, row]));
  return result.map(row => {
    const reply = row.message.replyToId ? visibleMessages.get(row.message.replyToId) : undefined;
    return {
      ...row.message,
      sender: row.sender,
      reply: reply ? { id: reply.message.id, body: reply.message.body, sender: reply.sender } : null,
      reactions: reactions.filter(reaction => reaction.messageId === row.message.id),
      savedByMe: savedIds.has(row.message.id),
    };
  });
}

export async function createMessageForConversation(userId: number, conversationId: number, body: string, replyToMessageId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const conversation = await db.select({ disappearingDuration: conversations.disappearingDuration }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const duration = conversation[0]?.disappearingDuration ?? 0;
  const result = await db.insert(messages).values({ conversationId, senderId: userId, body, replyToId: replyToMessageId ?? null, expiresAt: duration ? new Date(Date.now() + duration * 1000) : null });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  return Number(result[0].insertId);
}

export async function toggleReactionForMessage(userId: number, messageId: number, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(messageReactions).where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji))).limit(1);
  if (existing[0]) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
    return false;
  }
  await db.insert(messageReactions).values({ messageId, userId, emoji });
  return true;
}

export async function markConversationRead(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return;
  const latestMessage = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.id)).limit(1);
  await db.update(conversationMembers).set({ lastReadAt: new Date(), lastReadMessageId: latestMessage[0]?.id ?? null }).where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)));
}

export async function heartbeatUser(userId: number, activeConversationId?: number) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.insert(userPresence).values({ userId, state: "online", activeConversationId: activeConversationId ?? null, lastActiveAt: now }).onDuplicateKeyUpdate({
    set: { state: "online", activeConversationId: activeConversationId ?? null, lastActiveAt: now },
  });
}

export async function setTypingState(userId: number, conversationId: number, isTyping: boolean) {
  const db = await getDb();
  if (!db) return;
  if (!isTyping) {
    await db.delete(typingIndicators).where(and(eq(typingIndicators.userId, userId), eq(typingIndicators.conversationId, conversationId)));
    return;
  }
  const expiresAt = new Date(Date.now() + 20_000);
  await db.insert(typingIndicators).values({ conversationId, userId, expiresAt }).onDuplicateKeyUpdate({ set: { expiresAt } });
}

export async function getConversationActivity(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return { members: [], typing: [] };
  const members = await db
    .select({ id: users.id, name: users.name, statusText: users.statusText, avatarColor: users.avatarColor, presenceState: userPresence.state, lastActiveAt: userPresence.lastActiveAt })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .leftJoin(userPresence, eq(userPresence.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId));
  const typing = await db
    .select({ id: users.id, name: users.name })
    .from(typingIndicators)
    .innerJoin(users, eq(typingIndicators.userId, users.id))
    .where(and(eq(typingIndicators.conversationId, conversationId), gt(typingIndicators.expiresAt, new Date()), ne(typingIndicators.userId, userId)));
  return { members, typing };
}

export async function getMessage(messageId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  return result[0];
}

export async function editMessageForSender(userId: number, messageId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const message = await getMessage(messageId);
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  const error = getAdvancedMessageActionError({ actorId: userId, senderId: message.senderId, deletedAt: message.deletedAt, action: "edit" });
  if (error) throw new Error(error);
  await db.update(messages).set({ body, editedAt: new Date() }).where(eq(messages.id, messageId));
  return message.conversationId;
}

export async function retractMessageForSender(userId: number, messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const message = await getMessage(messageId);
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  const error = getAdvancedMessageActionError({ actorId: userId, senderId: message.senderId, deletedAt: message.deletedAt, action: "retract" });
  if (error === "MESSAGE_RETRACTED") return message.conversationId;
  if (error) throw new Error(error);
  await db.update(messages).set({ body: "Message retracted", deletedAt: new Date(), pinnedAt: null, pinnedBy: null }).where(eq(messages.id, messageId));
  await db.delete(messageReactions).where(eq(messageReactions.messageId, messageId));
  await db.delete(messageSaves).where(eq(messageSaves.messageId, messageId));
  return message.conversationId;
}

export async function setMessagePinned(userId: number, messageId: number, pinned: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const message = await getMessage(messageId);
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  const error = getAdvancedMessageActionError({ actorId: userId, senderId: message.senderId, deletedAt: message.deletedAt, action: "pin" });
  if (error) throw new Error(error);
  await db.update(messages).set(pinned ? { pinnedAt: new Date(), pinnedBy: userId } : { pinnedAt: null, pinnedBy: null }).where(eq(messages.id, messageId));
  return message.conversationId;
}

export async function toggleSavedMessage(userId: number, messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const message = await getMessage(messageId);
  if (!message) throw new Error("MESSAGE_NOT_FOUND");
  const error = getAdvancedMessageActionError({ actorId: userId, senderId: message.senderId, deletedAt: message.deletedAt, action: "save" });
  if (error) throw new Error(error);
  const existing = await db.select({ id: messageSaves.id }).from(messageSaves)
    .where(and(eq(messageSaves.userId, userId), eq(messageSaves.messageId, messageId))).limit(1);
  if (existing[0]) {
    await db.delete(messageSaves).where(eq(messageSaves.id, existing[0].id));
    return false;
  }
  await db.insert(messageSaves).values({ userId, messageId });
  return true;
}

export async function listPinnedMessagesForConversation(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ message: messages, sender: { id: users.id, name: users.name, username: users.username } })
    .from(messages).innerJoin(users, eq(messages.senderId, users.id))
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt), isNotNull(messages.pinnedAt)))
    .orderBy(desc(messages.pinnedAt));
  return result.map(row => ({ ...row.message, sender: row.sender }));
}

export async function searchMessagesForConversation(userId: number, conversationId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const result = await db.select({ message: messages, sender: { id: users.id, name: users.name, username: users.username } })
    .from(messages).innerJoin(users, eq(messages.senderId, users.id))
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt), or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())), like(messages.body, `%${normalized}%`)))
    .orderBy(desc(messages.createdAt)).limit(30);
  const ids = result.map(row => row.message.id);
  const saved = ids.length ? await db.select({ messageId: messageSaves.messageId }).from(messageSaves)
    .where(and(eq(messageSaves.userId, userId), inArray(messageSaves.messageId, ids))) : [];
  const savedIds = new Set(saved.map(item => item.messageId));
  return result.map(row => ({ ...row.message, sender: row.sender, savedByMe: savedIds.has(row.message.id) }));
}

export async function listSavedMessagesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ save: messageSaves, message: messages, sender: { id: users.id, name: users.name, username: users.username } })
    .from(messageSaves).innerJoin(messages, eq(messageSaves.messageId, messages.id)).innerJoin(users, eq(messages.senderId, users.id))
    .where(and(eq(messageSaves.userId, userId), isNull(messages.deletedAt), or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())))).orderBy(desc(messageSaves.createdAt)).limit(50);
  return result.map(row => ({ ...row.message, sender: row.sender, savedAt: row.save.createdAt, savedByMe: true }));
}

export async function clearConversationHistoryForUser(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const clearedAt = new Date();
  await db.insert(conversationHistoryClears).values({ conversationId, userId, clearedAt }).onDuplicateKeyUpdate({ set: { clearedAt } });
  return { clearedAt };
}

export async function deleteDirectConversationForUser(userId: number, conversationId: number) {
  const conversation = await getConversationForMember(userId, conversationId);
  if (conversation?.kind !== "direct") throw new Error("CONVERSATION_NOT_AVAILABLE");
  return clearConversationHistoryForUser(userId, conversationId);
}

export async function setConversationDisappearingDuration(conversationId: number, duration: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(conversations).set({ disappearingDuration: duration }).where(eq(conversations.id, conversationId));
  return duration;
}

export async function setConversationMuteForUser(userId: number, conversationId: number, duration: MuteDuration) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const preference = getMutePreference(duration);
  const storedPreference = {
    mutedForever: preference.mutedForever ? 1 : 0,
    mutedUntil: preference.mutedUntil ? new Date(preference.mutedUntil) : null,
  };
  await db.update(conversationMembers).set(storedPreference).where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)));
  return preference;
}

export async function setConversationArchivedForUser(userId: number, conversationId: number, archived: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const archivedAt = archived ? new Date() : null;
  await db.update(conversationMembers).set({ archivedAt }).where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)));
  return { archivedAt };
}

export async function setConversationOrganizationForUser(userId: number, conversationId: number, input: { favorite: boolean; label: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const personalLabel = input.label?.trim() || null;
  await db.update(conversationMembers).set({ isFavorite: input.favorite ? 1 : 0, personalLabel }).where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId)));
  return { favorite: input.favorite, label: personalLabel };
}

export async function changeUserPasswordHash(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}
