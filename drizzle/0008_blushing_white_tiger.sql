ALTER TABLE `conversation_members` ADD `isFavorite` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `personalLabel` varchar(32);