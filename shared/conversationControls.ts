export const muteDurationValues = [0, 3600, 28800, 86400, -1] as const;

export type MuteDuration = (typeof muteDurationValues)[number];

export type MutePreference = {
  mutedForever: boolean;
  mutedUntil: Date | string | null;
};

export function getMutePreference(duration: MuteDuration, now = new Date()): MutePreference {
  if (duration === -1) return { mutedForever: true, mutedUntil: null };
  if (duration === 0) return { mutedForever: false, mutedUntil: null };
  return { mutedForever: false, mutedUntil: new Date(now.getTime() + duration * 1000) };
}

export function isMuted(preference: MutePreference, now = new Date()): boolean {
  if (preference.mutedForever) return true;
  if (!preference.mutedUntil) return false;
  return new Date(preference.mutedUntil).getTime() > now.getTime();
}

export function getDraftStorageKey(conversationId: number) {
  return `orbit-draft-${conversationId}`;
}

export function splitArchivedConversations<T extends { archivedAt?: Date | string | null }>(conversations: T[]) {
  return {
    active: conversations.filter(conversation => !conversation.archivedAt),
    archived: conversations.filter(conversation => Boolean(conversation.archivedAt)),
  };
}

export function orderPersonalConversations<T extends { id: number; isFavorite?: boolean; personalLabel?: string | null }>(conversations: T[]) {
  return [...conversations].sort((first, second) => Number(Boolean(second.isFavorite)) - Number(Boolean(first.isFavorite)) || first.id - second.id);
}

export function parseReplyPrefix(body: string) {
  const match = body.match(/^Replying to @([a-z0-9_-]{3,32}):\s*[“"]?(.+?)[”"]?\s*\n\n([\s\S]+)$/i);
  if (!match) return null;
  return {
    username: match[1].toLowerCase(),
    context: match[2].trim(),
    body: match[3].trim(),
  };
}
