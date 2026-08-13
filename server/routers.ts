import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { archiveConversationSchema, conversationCreateSchema, conversationIdSchema, conversationOrganizationSchema, deviceIdentitySchema, devicePairingApprovalSchema, devicePairingRequestSchema, deviceRegistrationSchema, deviceRevokeSchema, disappearingMessagesSchema, heartbeatSchema, messageActionSchema, messageEditSchema, messagePinSchema, messageSearchSchema, messageSendSchema, muteConversationSchema, passwordChangeSchema, profileUpdateSchema, reactionToggleSchema, recoverDeviceIdentitySchema, trustedConnectionRedeemSchema, typingStateSchema } from "./chatSchemas";
import { isOrbitEncryptedEnvelope } from "../shared/e2ee";
import { authenticateNativeAccount, hashPassword, NativeAuthError, nativeCredentialsSchema, registerNativeAccount, verifyPassword } from "./nativeAuth";
import { toPublicUser } from "./publicUser";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

async function assertConversationMember(userId: number, conversationId: number) {
  const conversation = await db.getConversationForMember(userId, conversationId);
  if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
  return conversation;
}

async function assertApprovedDirectContact(userId: number, conversationId: number) {
  const conversation = await assertConversationMember(userId, conversationId);
  if (conversation.kind !== "direct") throw new TRPCError({ code: "FORBIDDEN", message: "Individual chat is only available for approved contacts." });
  const peerId = await db.getDirectPeer(userId, conversationId);
  if (!peerId || !await db.areAcceptedContacts(userId, peerId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Accept a contact request before chatting." });
  }
  return conversation;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? toPublicUser(opts.ctx.user) : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return { success: true } as const;
    }),
  }),
  nativeAuth: router({
    register: publicProcedure.input(nativeCredentialsSchema).mutation(async ({ ctx, input }) => {
      let user;
      try {
        user = await registerNativeAccount(db, input);
      } catch (error) {
        if (error instanceof NativeAuthError && error.code === "USERNAME_TAKEN") {
          throw new TRPCError({ code: "CONFLICT", message: "That username is already taken." });
        }
        throw error;
      }
      const token = await sdk.createSessionToken(user.openId, { name: user.name || user.username || input.username });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 365 });
      return toPublicUser(user);
    }),
    login: publicProcedure.input(nativeCredentialsSchema).mutation(async ({ ctx, input }) => {
      let user;
      try {
        user = await authenticateNativeAccount(db, input);
      } catch (error) {
        if (error instanceof NativeAuthError && error.code === "INVALID_CREDENTIALS") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
        }
        throw error;
      }
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const token = await sdk.createSessionToken(user.openId, { name: user.name || user.username || input.username });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 365 });
      return toPublicUser(user);
    }),
  }),
  profile: router({
    update: protectedProcedure
      .input(profileUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const profile = await db.updateUserProfile(ctx.user.id, input);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
        return toPublicUser(profile);
      }),
    deleteAccount: protectedProcedure
      .input(z.object({ password: z.string().min(8).max(128), confirmation: z.literal("DELETE") }))
      .mutation(async ({ ctx, input }) => {
        if (!await verifyPassword(input.password, ctx.user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Your password is incorrect." });
        }
        await db.deleteUserPermanently(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
        return { success: true } as const;
      }),
    changePassword: protectedProcedure
      .input(passwordChangeSchema)
      .mutation(async ({ ctx, input }) => {
        if (!await verifyPassword(input.currentPassword, ctx.user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Your current password is incorrect." });
        }
        await db.changeUserPasswordHash(ctx.user.id, await hashPassword(input.newPassword));
        const token = await sdk.createSessionToken(ctx.user.openId, { name: ctx.user.name || ctx.user.username || "Orbit user" });
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 365 });
        return { success: true } as const;
      }),
  }),
  security: router({
    publishDeviceIdentity: protectedProcedure.input(deviceIdentitySchema).mutation(async ({ ctx, input }) => {
      try {
        return await db.publishDeviceIdentity(ctx.user.id, input);
      } catch (error) {
        if (error instanceof Error && error.message === "DEVICE_KEY_MISMATCH") throw new TRPCError({ code: "CONFLICT", message: "This account already has a different secure device key. Orbit will not replace it silently." });
        throw error;
      }
    }),
    recoverDeviceIdentity: protectedProcedure.input(recoverDeviceIdentitySchema).mutation(async ({ ctx, input }) => {
      if (!await verifyPassword(input.currentPassword, ctx.user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Your current password is incorrect." });
      }
      return db.replaceDeviceIdentity(ctx.user.id, input);
    }),
    syncDevice: protectedProcedure.input(deviceRegistrationSchema).mutation(async ({ ctx, input }) => db.syncSecureDevice(ctx.user.id, { ...input, event: "registered" })),
    listDevices: protectedProcedure.query(({ ctx }) => db.listSecureDevices(ctx.user.id)),
    createPairing: protectedProcedure.input(z.object({ fingerprint: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/) })).mutation(async ({ ctx, input }) => {
      const pairing = await db.createSecureDevicePairing(ctx.user.id, input.fingerprint);
      return { ...pairing, path: `/pair/${pairing.token}` };
    }),
    requestPairing: protectedProcedure.input(devicePairingRequestSchema).mutation(async ({ ctx, input }) => db.requestSecureDevicePairing(ctx.user.id, input)),
    approvePairing: protectedProcedure.input(devicePairingApprovalSchema).mutation(async ({ ctx, input }) => db.approveSecureDevicePairing(ctx.user.id, input.pairingId, input.approve)),
    revokeDevice: protectedProcedure.input(deviceRevokeSchema).mutation(async ({ ctx, input }) => db.revokeSecureDevice(ctx.user.id, input.deviceId)),
  }),
  contacts: router({
    search: protectedProcedure
      .input(z.object({ username: z.string().trim().toLowerCase().max(32).default("") }))
      .query(({ ctx, input }) => db.searchUsersByUsername(ctx.user.id, input.username)),
    list: protectedProcedure.query(({ ctx }) => db.listContactsForUser(ctx.user.id)),
    requests: protectedProcedure.query(({ ctx }) => db.listContactRequests(ctx.user.id)),
    sendRequest: protectedProcedure
      .input(z.object({ username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_-]+$/) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.sendContactRequest(ctx.user.id, input.username);
        } catch (error) {
          if (error instanceof Error && error.message === "USER_NOT_FOUND") throw new TRPCError({ code: "NOT_FOUND", message: "No user found with that username." });
          if (error instanceof Error && error.message === "SELF_REQUEST") throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot send a request to yourself." });
          throw error;
        }
      }),
    respond: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.respondToContactRequest(ctx.user.id, input.requestId, input.accept);
        } catch (error) {
          if (error instanceof Error && error.message === "REQUEST_NOT_AVAILABLE") throw new TRPCError({ code: "NOT_FOUND", message: "This request is no longer available." });
          throw error;
        }
      }),
    cancel: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.cancelContactRequest(ctx.user.id, input.requestId);
        } catch (error) {
          if (error instanceof Error && error.message === "REQUEST_NOT_AVAILABLE") throw new TRPCError({ code: "NOT_FOUND", message: "This request is no longer available." });
          throw error;
        }
      }),
    createTrustedLink: protectedProcedure.mutation(async ({ ctx }) => {
      const link = await db.createTrustedConnectionLink(ctx.user.id);
      return { ...link, path: `/connect/${link.token}` };
    }),
    listTrustedLinks: protectedProcedure.query(({ ctx }) => db.listTrustedConnectionLinks(ctx.user.id)),
    revokeTrustedLink: protectedProcedure
      .input(z.object({ linkId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.revokeTrustedConnectionLink(ctx.user.id, input.linkId);
          return { success: true } as const;
        } catch (error) {
          if (error instanceof Error && error.message === "LINK_NOT_AVAILABLE") throw new TRPCError({ code: "NOT_FOUND", message: "This link can no longer be revoked." });
          throw error;
        }
      }),
    redeemTrustedLink: protectedProcedure
      .input(trustedConnectionRedeemSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.redeemTrustedConnectionLink(ctx.user.id, input.token);
        } catch (error) {
          if (error instanceof Error && error.message === "LINK_NOT_AVAILABLE") throw new TRPCError({ code: "NOT_FOUND", message: "This one-time connection link is unavailable or has expired." });
          throw error;
        }
      }),
  }),
  chat: router({
    bootstrap: protectedProcedure.mutation(async ({ ctx }) => {
      await db.ensurePersonalOrbit(ctx.user.id);
      return { success: true } as const;
    }),
    listConversations: protectedProcedure.query(async ({ ctx }) => {
      await db.ensurePersonalOrbit(ctx.user.id);
      return db.listConversationsForUser(ctx.user.id);
    }),
    createConversation: protectedProcedure
      .input(conversationCreateSchema)
      .mutation(({ ctx, input }) => db.createConversationForUser(ctx.user.id, input)),
    findPeople: protectedProcedure
      .input(z.object({ query: z.string().trim().max(80).default("") }))
      .query(({ ctx, input }) => db.findPeopleForInvite(ctx.user.id, input.query)),
    createDirect: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!await db.areAcceptedContacts(ctx.user.id, input.userId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Accept a contact request before starting a chat." });
        }
        return db.createDirectConversation(ctx.user.id, input.userId);
      }),
    inviteMember: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You are already in this room." });
        await assertConversationMember(ctx.user.id, input.conversationId);
        const status = await db.inviteMemberToConversation(ctx.user.id, input.conversationId, input.userId);
        return { success: true, status } as const;
      }),
    listMessages: protectedProcedure.input(conversationIdSchema).query(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.listMessagesForConversation(ctx.user.id, input.conversationId);
    }),
    activity: protectedProcedure.input(conversationIdSchema).query(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.getConversationActivity(ctx.user.id, input.conversationId);
    }),
    sendMessage: protectedProcedure
      .input(messageSendSchema)
      .mutation(async ({ ctx, input }) => {
        await assertApprovedDirectContact(ctx.user.id, input.conversationId);
        if (ctx.user.encryptionPublicKey) {
          const peerId = await db.getDirectPeer(ctx.user.id, input.conversationId);
          const peer = peerId ? await db.getUserById(peerId) : undefined;
          if (!peer?.encryptionPublicKey || !peer.signingPublicKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your contact has not finished secure-device setup yet." });
          if (!isOrbitEncryptedEnvelope(input.body)) throw new TRPCError({ code: "BAD_REQUEST", message: "Secure chats accept only encrypted message envelopes." });
        }
        if (input.replyToMessageId) {
          const target = await db.getMessage(input.replyToMessageId);
          if (!target || target.conversationId !== input.conversationId || target.deletedAt || (target.expiresAt && target.expiresAt <= new Date())) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That reply context is no longer available." });
          }
        }
        const messageId = await db.createMessageForConversation(ctx.user.id, input.conversationId, input.body, input.replyToMessageId);
        return { messageId };
      }),
    toggleReaction: protectedProcedure
      .input(reactionToggleSchema)
      .mutation(async ({ ctx, input }) => {
        const message = await db.getMessage(input.messageId);
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        await assertApprovedDirectContact(ctx.user.id, message.conversationId);
        return { added: await db.toggleReactionForMessage(ctx.user.id, input.messageId, input.emoji) };
      }),
    editMessage: protectedProcedure
      .input(messageEditSchema)
      .mutation(async ({ ctx, input }) => {
        const message = await db.getMessage(input.messageId);
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        await assertApprovedDirectContact(ctx.user.id, message.conversationId);
        if (isOrbitEncryptedEnvelope(message.body) && !isOrbitEncryptedEnvelope(input.body)) throw new TRPCError({ code: "BAD_REQUEST", message: "Encrypted messages must remain encrypted when edited." });
        try {
          await db.editMessageForSender(ctx.user.id, input.messageId, input.body);
          return { success: true } as const;
        } catch (error) {
          if (error instanceof Error && error.message === "MESSAGE_NOT_OWNED") throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own messages." });
          if (error instanceof Error && error.message === "MESSAGE_RETRACTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Retracted messages cannot be edited." });
          throw error;
        }
      }),
    retractMessage: protectedProcedure
      .input(messageActionSchema)
      .mutation(async ({ ctx, input }) => {
        const message = await db.getMessage(input.messageId);
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        await assertApprovedDirectContact(ctx.user.id, message.conversationId);
        try {
          await db.retractMessageForSender(ctx.user.id, input.messageId);
          return { success: true } as const;
        } catch (error) {
          if (error instanceof Error && error.message === "MESSAGE_NOT_OWNED") throw new TRPCError({ code: "FORBIDDEN", message: "You can only retract your own messages." });
          throw error;
        }
      }),
    setPinned: protectedProcedure
      .input(messagePinSchema)
      .mutation(async ({ ctx, input }) => {
        const message = await db.getMessage(input.messageId);
        if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        await assertApprovedDirectContact(ctx.user.id, message.conversationId);
        await db.setMessagePinned(ctx.user.id, input.messageId, input.pinned);
        return { success: true } as const;
      }),
    toggleSaved: protectedProcedure
      .input(messageActionSchema)
      .mutation(async ({ ctx, input }) => {
        const message = await db.getMessage(input.messageId);
        if (!message || message.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        await assertApprovedDirectContact(ctx.user.id, message.conversationId);
        return { saved: await db.toggleSavedMessage(ctx.user.id, input.messageId) };
      }),
    listPinned: protectedProcedure
      .input(conversationIdSchema)
      .query(async ({ ctx, input }) => {
        await assertApprovedDirectContact(ctx.user.id, input.conversationId);
        return db.listPinnedMessagesForConversation(input.conversationId);
      }),
    searchMessages: protectedProcedure
      .input(messageSearchSchema)
      .query(async ({ ctx, input }) => {
        await assertApprovedDirectContact(ctx.user.id, input.conversationId);
        return db.searchMessagesForConversation(ctx.user.id, input.conversationId, input.query);
      }),
    listSaved: protectedProcedure.query(async ({ ctx }) => db.listSavedMessagesForUser(ctx.user.id)),
    clearHistory: protectedProcedure.input(conversationIdSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.clearConversationHistoryForUser(ctx.user.id, input.conversationId);
    }),
    deleteDirect: protectedProcedure.input(conversationIdSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      try {
        const result = await db.deleteDirectConversationForUser(ctx.user.id, input.conversationId);
        return { success: true, clearedAt: result.clearedAt } as const;
      } catch (error) {
        if (error instanceof Error && error.message === "CONVERSATION_NOT_AVAILABLE") throw new TRPCError({ code: "NOT_FOUND", message: "This direct chat is no longer available." });
        throw error;
      }
    }),
    setDisappearing: protectedProcedure.input(disappearingMessagesSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return { duration: await db.setConversationDisappearingDuration(input.conversationId, input.duration) };
    }),
    setMute: protectedProcedure.input(muteConversationSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.setConversationMuteForUser(ctx.user.id, input.conversationId, input.duration);
    }),
    setArchived: protectedProcedure.input(archiveConversationSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.setConversationArchivedForUser(ctx.user.id, input.conversationId, input.archived);
    }),
    setOrganization: protectedProcedure.input(conversationOrganizationSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      return db.setConversationOrganizationForUser(ctx.user.id, input.conversationId, { favorite: input.favorite, label: input.label });
    }),
    markRead: protectedProcedure.input(conversationIdSchema).mutation(async ({ ctx, input }) => {
      await assertApprovedDirectContact(ctx.user.id, input.conversationId);
      await db.markConversationRead(ctx.user.id, input.conversationId);
      return { success: true } as const;
    }),
    heartbeat: protectedProcedure
      .input(heartbeatSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.activeConversationId) await assertApprovedDirectContact(ctx.user.id, input.activeConversationId);
        await db.heartbeatUser(ctx.user.id, input.activeConversationId);
        return { success: true } as const;
      }),
    setTyping: protectedProcedure
      .input(typingStateSchema)
      .mutation(async ({ ctx, input }) => {
        await assertApprovedDirectContact(ctx.user.id, input.conversationId);
        await db.setTypingState(ctx.user.id, input.conversationId, input.isTyping);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
