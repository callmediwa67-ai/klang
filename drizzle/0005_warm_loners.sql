WITH ranked AS (
  SELECT id, name, normalized_name,
    ROW_NUMBER() OVER (PARTITION BY normalized_name ORDER BY created_at ASC, id ASC) AS position
  FROM categories
)
UPDATE items
SET category = COALESCE((
  SELECT name FROM ranked
  WHERE ranked.normalized_name = lower(trim(items.category)) AND ranked.position = 1
), category)
WHERE EXISTS (
  SELECT 1 FROM ranked WHERE ranked.normalized_name = lower(trim(items.category))
);--> statement-breakpoint
DELETE FROM categories
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY normalized_name ORDER BY created_at ASC, id ASC) AS position
    FROM categories
  ) WHERE position > 1
);--> statement-breakpoint
DROP INDEX `idx_categories_normalized_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_normalized_name_unique` ON `categories` (`normalized_name`);
