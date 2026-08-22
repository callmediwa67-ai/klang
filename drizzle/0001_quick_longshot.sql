CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text DEFAULT 'item' NOT NULL,
	`entity_id` text NOT NULL,
	`summary` text NOT NULL,
	`actor_device_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_team` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_created` ON `activity_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `item_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`inbox` integer NOT NULL,
	`favorite` integer NOT NULL,
	`deleted_at` text,
	`actor_device_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_team` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_item_versions_item_created` ON `item_versions` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `created_by_device_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `created_by_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `created_by_team` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `updated_by_device_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `updated_by_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `updated_by_team` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `items` ADD `deleted_by_device_id` text;--> statement-breakpoint
ALTER TABLE `items` ADD `deleted_by_name` text;--> statement-breakpoint
ALTER TABLE `items` ADD `deleted_by_team` text;--> statement-breakpoint
CREATE INDEX `idx_items_deleted_updated` ON `items` (`deleted_at`,`updated_at`);