export type InvitationContext = {
  ownerId: number;
  recipientId: number;
  conversation: { kind: "group" | "direct"; createdBy: number } | undefined;
};

export function getInvitationError(context: InvitationContext): string | undefined {
  if (!context.conversation) return "Conversation not found.";
  if (context.conversation.createdBy !== context.ownerId) return "Only the room owner can invite people.";
  if (context.conversation.kind !== "group") return "Private signals cannot be converted into group rooms.";
  if (context.ownerId === context.recipientId) return "You are already in this room.";
  return undefined;
}

export function getDirectConversationError(initiatorId: number, recipientId: number): string | undefined {
  if (initiatorId === recipientId) return "You cannot open a direct signal with yourself.";
  return undefined;
}

export function shouldCountAsUnread(input: { senderId: number; recipientId: number; createdAt: Date; lastReadAt: Date | null }): boolean {
  if (input.senderId === input.recipientId) return false;
  return !input.lastReadAt || input.createdAt > input.lastReadAt;
}

export function shouldCountMessageIdAsUnread(input: { messageId: number; senderId: number; recipientId: number; lastReadMessageId: number | null }): boolean {
  if (input.senderId === input.recipientId) return false;
  return input.lastReadMessageId === null || input.messageId > input.lastReadMessageId;
}
