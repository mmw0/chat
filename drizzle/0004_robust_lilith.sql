ALTER TABLE `conversation_members` ADD `lastReadMessageId` int;
--> statement-breakpoint
UPDATE `conversation_members` AS cm
SET `lastReadMessageId` = (
  SELECT MAX(m.`id`) FROM `messages` AS m
  WHERE m.`conversationId` = cm.`conversationId`
    AND m.`createdAt` <= cm.`lastReadAt`
)
WHERE cm.`lastReadMessageId` IS NULL AND cm.`lastReadAt` IS NOT NULL;
