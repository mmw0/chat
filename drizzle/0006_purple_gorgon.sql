CREATE TABLE `conversation_history_clears` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`clearedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversation_history_clears_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversation_history_clears_conversation_user_unique` UNIQUE(`conversationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `trusted_connection_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`redeemedAt` timestamp,
	`redeemedBy` int,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trusted_connection_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `trusted_connection_links_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `disappearingDuration` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarId` varchar(24) DEFAULT 'orbit-01' NOT NULL;--> statement-breakpoint
CREATE INDEX `conversation_history_clears_user_idx` ON `conversation_history_clears` (`userId`);--> statement-breakpoint
CREATE INDEX `trusted_connection_links_creator_idx` ON `trusted_connection_links` (`creatorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `trusted_connection_links_expires_at_idx` ON `trusted_connection_links` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `messages_expires_at_idx` ON `messages` (`expiresAt`);