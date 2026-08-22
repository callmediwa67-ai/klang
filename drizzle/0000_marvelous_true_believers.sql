CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'uncategorized' NOT NULL,
	`inbox` integer DEFAULT true NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_items_inbox_updated` ON `items` (`inbox`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_items_favorite_updated` ON `items` (`favorite`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_items_category` ON `items` (`category`);