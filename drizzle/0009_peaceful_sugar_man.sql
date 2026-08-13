ALTER TABLE `users` ADD `encryptionPublicKey` text;--> statement-breakpoint
ALTER TABLE `users` ADD `signingPublicKey` text;--> statement-breakpoint
ALTER TABLE `users` ADD `encryptionFingerprint` varchar(32);