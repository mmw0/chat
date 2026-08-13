import { describe, expect, it } from "vitest";
import { getDraftStorageKey, getMutePreference, isMuted, orderPersonalConversations, parseReplyPrefix, splitArchivedConversations } from "../shared/conversationControls";

describe("personal conversation controls", () => {
  it("calculates temporary, permanent, and cleared mute preferences without sharing them", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    expect(getMutePreference(0, now)).toEqual({ mutedForever: false, mutedUntil: null });
    expect(getMutePreference(-1, now)).toEqual({ mutedForever: true, mutedUntil: null });
    expect(getMutePreference(3600, now)).toEqual({ mutedForever: false, mutedUntil: new Date("2026-08-13T01:00:00.000Z") });
  });

  it("recognizes only active mute windows", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    expect(isMuted({ mutedForever: false, mutedUntil: new Date("2026-08-13T00:01:00.000Z") }, now)).toBe(true);
    expect(isMuted({ mutedForever: false, mutedUntil: new Date("2026-08-12T23:59:59.000Z") }, now)).toBe(false);
    expect(isMuted({ mutedForever: true, mutedUntil: null }, now)).toBe(true);
  });

  it("extracts a legacy reply prefix into a visual context and visible message body", () => {
    expect(parseReplyPrefix("Replying to @Mina: “Meet me at dusk”\n\nI will be there.")).toEqual({
      username: "mina",
      context: "Meet me at dusk",
      body: "I will be there.",
    });
    expect(parseReplyPrefix("Just a normal message")).toBeNull();
  });

  it("keeps drafts scoped to one conversation and archives only the owner’s workspace row", () => {
    expect(getDraftStorageKey(42)).toBe("orbit-draft-42");
    expect(splitArchivedConversations([
      { id: 1, archivedAt: null },
      { id: 2, archivedAt: new Date("2026-08-13T00:00:00.000Z") },
    ])).toEqual({
      active: [{ id: 1, archivedAt: null }],
      archived: [{ id: 2, archivedAt: new Date("2026-08-13T00:00:00.000Z") }],
    });
  });

  it("surfaces favorites before ordinary personal conversation rows without changing their identity", () => {
    expect(orderPersonalConversations([{ id: 3, isFavorite: false }, { id: 1, isFavorite: true }, { id: 2, isFavorite: true }])).toEqual([
      { id: 1, isFavorite: true },
      { id: 2, isFavorite: true },
      { id: 3, isFavorite: false },
    ]);
  });
});
