CREATE TABLE `message_saves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_saves_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_saves_message_user_unique` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `editedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinnedAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinnedBy` int;--> statement-breakpoint
CREATE INDEX `message_saves_user_created_at_idx` ON `message_saves` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_conversation_pinned_at_idx` ON `messages` (`conversationId`,`pinnedAt`);