CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by_name` text NOT NULL,
	`uploaded_by_team` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_item_created` ON `attachments` (`item_id`,`created_at`);