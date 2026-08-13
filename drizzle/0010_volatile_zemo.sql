CREATE TABLE `secure_device_key_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`fingerprint` varchar(32) NOT NULL,
	`encryptionPublicKey` text NOT NULL,
	`signingPublicKey` text NOT NULL,
	`event` enum('registered','paired','recovered','revoked') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `secure_device_key_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secure_device_pairings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`creatorDeviceId` varchar(64) NOT NULL,
	`targetDeviceId` varchar(64),
	`targetLabel` varchar(80),
	`targetEncryptionPublicKey` text,
	`targetSigningPublicKey` text,
	`targetFingerprint` varchar(32),
	`status` enum('open','pending','approved','rejected','expired','revoked') NOT NULL DEFAULT 'open',
	`expiresAt` timestamp NOT NULL,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `secure_device_pairings_id` PRIMARY KEY(`id`),
	CONSTRAINT `secure_device_pairings_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `secure_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`encryptionPublicKey` text NOT NULL,
	`signingPublicKey` text NOT NULL,
	`fingerprint` varchar(32) NOT NULL,
	`status` enum('active','pending','revoked') NOT NULL DEFAULT 'pending',
	`pairedAt` timestamp,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `secure_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `secure_devices_user_device_unique` UNIQUE(`userId`,`deviceId`)
);
--> statement-breakpoint
CREATE INDEX `secure_device_key_history_user_created_idx` ON `secure_device_key_history` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `secure_device_key_history_device_idx` ON `secure_device_key_history` (`deviceId`);--> statement-breakpoint
CREATE INDEX `secure_device_pairings_user_status_idx` ON `secure_device_pairings` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `secure_device_pairings_expires_at_idx` ON `secure_device_pairings` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `secure_devices_user_status_idx` ON `secure_devices` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `secure_devices_fingerprint_idx` ON `secure_devices` (`fingerprint`);