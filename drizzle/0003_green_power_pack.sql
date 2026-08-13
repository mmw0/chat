CREATE TABLE `contact_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_requests_pair_unique` UNIQUE(`requesterId`,`recipientId`)
);
--> statement-breakpoint
CREATE INDEX `contact_requests_requester_idx` ON `contact_requests` (`requesterId`,`status`);--> statement-breakpoint
CREATE INDEX `contact_requests_recipient_idx` ON `contact_requests` (`recipientId`,`status`);