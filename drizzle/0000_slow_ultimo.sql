CREATE TABLE `conversation_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`lastReadAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversation_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversation_members_conversation_user_unique` UNIQUE(`conversationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('group','direct') NOT NULL DEFAULT 'group',
	`name` varchar(160) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_reactions_message_user_emoji_unique` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`attachmentName` varchar(255),
	`attachmentUrl` text,
	`attachmentMime` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `conversation_members_user_idx` ON `conversation_members` (`userId`);--> statement-breakpoint
CREATE INDEX `conversation_members_conversation_idx` ON `conversation_members` (`conversationId`);--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `message_reactions_message_idx` ON `message_reactions` (`messageId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_at_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`senderId`);