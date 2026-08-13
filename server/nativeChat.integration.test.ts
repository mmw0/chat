import { and, eq, inArray, or } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { contactRequests, conversationMembers, conversations, messageReactions, messages, typingIndicators, userPresence, users } from "../drizzle/schema";
import * as db from "./db";
import { hashPassword } from "./nativeAuth";

const describeIntegration = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeIntegration("native account chat persistence", () => {
  it("persists a signed-in user’s profile, room, messages, unread state, typing, and presence", async () => {
    const database = await db.getDb();
    if (!database) throw new Error("Managed database is unavailable for integration validation");
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const usernames = [`orbit_verify_${suffix}`, `orbit_peer_${suffix}`];
    const createdUserIds: number[] = [];
    let conversationId: number | undefined;
    let messageIds: number[] = [];

    try {
      const owner = await db.createNativeUser({ username: usernames[0], passwordHash: await hashPassword(`valid-password-${suffix}`) });
      createdUserIds.push(owner.id);
      const peer = await db.createNativeUser({ username: usernames[1], passwordHash: await hashPassword(`valid-password-${suffix}`) });
      createdUserIds.push(peer.id);

      const updated = await db.updateUserProfile(owner.id, { name: "Orbit verifier", statusText: "Testing the signal", avatarColor: "#DFF2C5" });
      expect(updated?.statusText).toBe("Testing the signal");

      const sentRequest = await db.sendContactRequest(owner.id, peer.username!);
      expect(sentRequest.status).toBe("sent");
      const acceptedRequest = await db.respondToContactRequest(peer.id, (await db.getContactRequestBetween(owner.id, peer.id))!.id, true);
      expect(acceptedRequest.status).toBe("accepted");
      conversationId = acceptedRequest.conversationId;
      expect(await db.areAcceptedContacts(owner.id, peer.id)).toBe(true);

      messageIds.push(await db.createMessageForConversation(owner.id, conversationId, "A persisted native-auth message."));
      messageIds.push(await db.createMessageForConversation(peer.id, conversationId, "A peer message for unread validation."));
      await db.toggleReactionForMessage(owner.id, messageIds[0], "✦");

      await database.update(conversationMembers).set({ lastReadMessageId: messageIds[0] }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, owner.id)));
      const beforeRead = await db.listConversationsForUser(owner.id);
      expect(beforeRead.find(conversation => conversation.id === conversationId)?.unread).toBeGreaterThanOrEqual(1);
      await database.update(conversationMembers).set({ lastReadMessageId: null, lastReadAt: new Date(Date.now() + 1_000) }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, owner.id)));
      const legacyFallback = await db.listConversationsForUser(owner.id);
      expect(legacyFallback.find(conversation => conversation.id === conversationId)?.unread).toBe(0);
      await db.markConversationRead(owner.id, conversationId);
      const afterRead = await db.listConversationsForUser(owner.id);
      expect(afterRead.find(conversation => conversation.id === conversationId)?.unread).toBe(0);

      await db.heartbeatUser(owner.id, conversationId);
      await db.heartbeatUser(peer.id, conversationId);
      await db.setTypingState(peer.id, conversationId, true);
      const activity = await db.getConversationActivity(owner.id, conversationId);
      expect(activity.members.map(member => member.id)).toContain(owner.id);
      expect(activity.typing.map(member => member.id)).toContain(peer.id);

      const timeline = await db.listMessagesForConversation(conversationId);
      expect(timeline).toHaveLength(2);
      expect(timeline[0].reactions.some(reaction => reaction.emoji === "✦")).toBe(true);

      const legacyConversationId = await db.createConversationForUser(owner.id, { name: "legacy verification room", description: "Temporary orphan cleanup coverage" });
      await db.deleteUserPermanently(owner.id);
      expect(await db.getUserByUsername(owner.username!)).toBeUndefined();
      expect((await database.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, legacyConversationId))).length).toBe(0);
      const replacement = await db.createNativeUser({ username: owner.username!, passwordHash: await hashPassword(`replacement-password-${suffix}`) });
      createdUserIds.push(replacement.id);
      expect(replacement.username).toBe(owner.username);
    } finally {
      if (conversationId) {
        await database.delete(typingIndicators).where(eq(typingIndicators.conversationId, conversationId));
        if (createdUserIds.length) await database.delete(userPresence).where(inArray(userPresence.userId, createdUserIds));
        if (messageIds.length) await database.delete(messageReactions).where(inArray(messageReactions.messageId, messageIds));
        await database.delete(messages).where(eq(messages.conversationId, conversationId));
        await database.delete(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
        await database.delete(conversations).where(eq(conversations.id, conversationId));
      }
      if (createdUserIds.length) {
        await database.delete(contactRequests).where(or(inArray(contactRequests.requesterId, createdUserIds), inArray(contactRequests.recipientId, createdUserIds)));
        await database.delete(users).where(inArray(users.id, createdUserIds));
      }
    }
  }, 30_000);
});
