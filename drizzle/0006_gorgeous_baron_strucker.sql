DROP INDEX `idx_categories_active_name`;--> statement-breakpoint
ALTER TABLE `categories` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_categories_active_order` ON `categories` (`archived_at`,`sort_order`);