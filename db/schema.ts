import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["note", "link", "document"] }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    url: text("url").notNull().default(""),
    category: text("category").notNull().default("uncategorized"),
    inbox: integer("inbox", { mode: "boolean" }).notNull().default(true),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(1),
    createdByDeviceId: text("created_by_device_id").notNull().default(""),
    createdByName: text("created_by_name").notNull().default(""),
    createdByTeam: text("created_by_team").notNull().default(""),
    updatedByDeviceId: text("updated_by_device_id").notNull().default(""),
    updatedByName: text("updated_by_name").notNull().default(""),
    updatedByTeam: text("updated_by_team").notNull().default(""),
    deletedAt: text("deleted_at"),
    deletedByDeviceId: text("deleted_by_device_id"),
    deletedByName: text("deleted_by_name"),
    deletedByTeam: text("deleted_by_team"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_items_inbox_updated").on(table.inbox, table.updatedAt),
    index("idx_items_favorite_updated").on(table.favorite, table.updatedAt),
    index("idx_items_category").on(table.category),
    index("idx_items_deleted_updated").on(table.deletedAt, table.updatedAt),
  ],
);

export const itemVersions = sqliteTable(
  "item_versions",
  {
    id: text("id").primaryKey(), itemId: text("item_id").notNull(), versionNumber: integer("version_number").notNull(),
    type: text("type").notNull(), title: text("title").notNull(), content: text("content").notNull().default(""),
    url: text("url").notNull().default(""), category: text("category").notNull(),
    inbox: integer("inbox", { mode: "boolean" }).notNull(), favorite: integer("favorite", { mode: "boolean" }).notNull(),
    deletedAt: text("deleted_at"), actorDeviceId: text("actor_device_id").notNull(), actorName: text("actor_name").notNull(),
    actorTeam: text("actor_team").notNull(), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_item_versions_item_created").on(table.itemId, table.createdAt)],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type").notNull().default("item"),
    entityId: text("entity_id").notNull(), summary: text("summary").notNull(), actorDeviceId: text("actor_device_id").notNull(),
    actorName: text("actor_name").notNull(), actorTeam: text("actor_team").notNull(), createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_activity_created").on(table.createdAt)],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), windowStart: integer("window_start").notNull(), count: integer("count").notNull(),
});

export type VaultItem = typeof items.$inferSelect;
