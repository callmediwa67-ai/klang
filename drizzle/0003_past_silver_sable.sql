CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`body` text NOT NULL,
	`author_name` text NOT NULL,
	`author_team` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_item_created` ON `comments` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_item_tags_item` ON `item_tags` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_item_tags_tag` ON `item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'neutral' NOT NULL,
	`created_by_name` text NOT NULL,
	`created_by_team` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tags_name` ON `tags` (`name`);