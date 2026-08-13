import { describe, expect, it } from "vitest";
import { getDirectConversationError, getInvitationError, shouldCountAsUnread, shouldCountMessageIdAsUnread } from "./chatPolicy";

describe("Orbit collaboration policy", () => {
  it("allows an owner to invite another person into a group room", () => {
    expect(getInvitationError({ ownerId: 4, recipientId: 7, conversation: { kind: "group", createdBy: 4 } })).toBeUndefined();
  });

  it("protects direct signals and ownership boundaries from member invites", () => {
    expect(getInvitationError({ ownerId: 4, recipientId: 7, conversation: { kind: "direct", createdBy: 4 } })).toContain("Private signals");
    expect(getInvitationError({ ownerId: 4, recipientId: 7, conversation: { kind: "group", createdBy: 8 } })).toContain("Only the room owner");
  });

  it("rejects self-targeting and missing conversation paths", () => {
    expect(getInvitationError({ ownerId: 4, recipientId: 4, conversation: { kind: "group", createdBy: 4 } })).toContain("already");
    expect(getInvitationError({ ownerId: 4, recipientId: 7, conversation: undefined })).toContain("not found");
    expect(getDirectConversationError(4, 4)).toContain("yourself");
  });

  it("counts only incoming messages that arrived after the member last read the room", () => {
    const readAt = new Date("2026-08-12T10:00:00.000Z");
    expect(shouldCountAsUnread({ senderId: 8, recipientId: 4, createdAt: new Date("2026-08-12T10:01:00.000Z"), lastReadAt: readAt })).toBe(true);
    expect(shouldCountAsUnread({ senderId: 4, recipientId: 4, createdAt: new Date("2026-08-12T10:02:00.000Z"), lastReadAt: readAt })).toBe(false);
    expect(shouldCountAsUnread({ senderId: 8, recipientId: 4, createdAt: new Date("2026-08-12T09:59:00.000Z"), lastReadAt: readAt })).toBe(false);
    expect(shouldCountAsUnread({ senderId: 8, recipientId: 4, createdAt: new Date("2026-08-12T09:59:00.000Z"), lastReadAt: null })).toBe(true);
  });

  it("uses message identifiers to preserve unread messages created in the same timestamp window", () => {
    expect(shouldCountMessageIdAsUnread({ messageId: 42, senderId: 8, recipientId: 4, lastReadMessageId: 41 })).toBe(true);
    expect(shouldCountMessageIdAsUnread({ messageId: 41, senderId: 8, recipientId: 4, lastReadMessageId: 41 })).toBe(false);
    expect(shouldCountMessageIdAsUnread({ messageId: 42, senderId: 4, recipientId: 4, lastReadMessageId: 41 })).toBe(false);
  });
});
