import { describe, expect, it } from "vitest";
import { canCancelRequest, canRespondToRequest, getRequestSendAction } from "./contactPolicy";

describe("Orbit contact-request policy", () => {
  it("allows an initial request and treats accepted or pending relationships as non-duplicating", () => {
    expect(getRequestSendAction({ requesterId: 1, recipientId: 2 })).toBe("send");
    expect(getRequestSendAction({ requesterId: 1, recipientId: 2, existingStatus: "pending" })).toBe("pending");
    expect(getRequestSendAction({ requesterId: 1, recipientId: 2, existingStatus: "accepted" })).toBe("accepted");
  });

  it("blocks self-requests and protects request ownership for transitions", () => {
    expect(getRequestSendAction({ requesterId: 1, recipientId: 1 })).toBe("self");
    expect(canRespondToRequest({ requesterId: 1, recipientId: 2, actorId: 2, status: "pending" })).toBe(true);
    expect(canRespondToRequest({ requesterId: 1, recipientId: 2, actorId: 1, status: "pending" })).toBe(false);
    expect(canCancelRequest({ requesterId: 1, actorId: 1, status: "pending" })).toBe(true);
    expect(canCancelRequest({ requesterId: 1, actorId: 2, status: "pending" })).toBe(false);
    expect(canCancelRequest({ requesterId: 1, actorId: 1, status: "accepted" })).toBe(false);
  });
});
