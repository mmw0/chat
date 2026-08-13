export type ContactRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export function getRequestSendAction(input: { requesterId: number; recipientId: number; existingStatus?: ContactRequestStatus }): "self" | "pending" | "accepted" | "send" {
  if (input.requesterId === input.recipientId) return "self";
  if (input.existingStatus === "pending") return "pending";
  if (input.existingStatus === "accepted") return "accepted";
  return "send";
}

export function canRespondToRequest(input: { requesterId: number; recipientId: number; actorId: number; status: ContactRequestStatus }): boolean {
  return input.actorId === input.recipientId && input.status === "pending";
}

export function canCancelRequest(input: { requesterId: number; actorId: number; status: ContactRequestStatus }): boolean {
  return input.actorId === input.requesterId && input.status === "pending";
}
