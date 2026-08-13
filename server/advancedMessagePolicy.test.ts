import { describe, expect, it } from "vitest";
import { getAdvancedMessageActionError } from "./advancedMessagePolicy";

describe("advanced message policy", () => {
  it("keeps editing and retraction sender-owned", () => {
    expect(getAdvancedMessageActionError({ actorId: 8, senderId: 4, deletedAt: null, action: "edit" })).toBe("MESSAGE_NOT_OWNED");
    expect(getAdvancedMessageActionError({ actorId: 8, senderId: 4, deletedAt: null, action: "retract" })).toBe("MESSAGE_NOT_OWNED");
    expect(getAdvancedMessageActionError({ actorId: 4, senderId: 4, deletedAt: null, action: "edit" })).toBeNull();
  });

  it("allows either accepted chat participant to organize active messages", () => {
    expect(getAdvancedMessageActionError({ actorId: 8, senderId: 4, deletedAt: null, action: "pin" })).toBeNull();
    expect(getAdvancedMessageActionError({ actorId: 8, senderId: 4, deletedAt: null, action: "save" })).toBeNull();
  });

  it("prevents every advanced action on retracted messages", () => {
    for (const action of ["edit", "retract", "pin", "save"] as const) {
      expect(getAdvancedMessageActionError({ actorId: 4, senderId: 4, deletedAt: new Date(), action })).toBe("MESSAGE_RETRACTED");
    }
  });
});
