CREATE TABLE `typing_indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `typing_indicators_id` PRIMARY KEY(`id`),
	CONSTRAINT `typing_indicators_conversation_user_unique` UNIQUE(`conversationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_presence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`state` enum('online','away','offline') NOT NULL DEFAULT 'online',
	`activeConversationId` int,
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_presence_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_presence_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `statusText` varchar(120) DEFAULT 'Available' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarColor` varchar(16) DEFAULT '#DFF2C5' NOT NULL;--> statement-breakpoint
CREATE INDEX `typing_indicators_conversation_idx` ON `typing_indicators` (`conversationId`);--> statement-breakpoint
CREATE INDEX `user_presence_conversation_idx` ON `user_presence` (`activeConversationId`);