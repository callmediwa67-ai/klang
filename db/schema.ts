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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_items_inbox_updated").on(table.inbox, table.updatedAt),
    index("idx_items_favorite_updated").on(table.favorite, table.updatedAt),
    index("idx_items_category").on(table.category),
  ],
);

export type VaultItem = typeof items.$inferSelect;
