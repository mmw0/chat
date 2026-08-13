ALTER TABLE `conversation_members` ADD `mutedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `mutedForever` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `replyToId` int;--> statement-breakpoint
CREATE INDEX `messages_reply_to_idx` ON `messages` (`replyToId`);