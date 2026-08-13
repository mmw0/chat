export type AdvancedMessageAction = "edit" | "retract" | "pin" | "save";

export function getAdvancedMessageActionError(input: {
  actorId: number;
  senderId: number;
  deletedAt: Date | null;
  action: AdvancedMessageAction;
}) {
  if (input.deletedAt) return "MESSAGE_RETRACTED" as const;
  if ((input.action === "edit" || input.action === "retract") && input.actorId !== input.senderId) {
    return "MESSAGE_NOT_OWNED" as const;
  }
  return null;
}
