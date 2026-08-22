CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color` text DEFAULT 'neutral' NOT NULL,
	`created_by_name` text NOT NULL,
	`created_by_team` text NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_categories_normalized_name` ON `categories` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_categories_active_name` ON `categories` (`archived_at`,`name`);