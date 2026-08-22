import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialized = false;
let lastMaintenanceAt = 0;

const itemColumns: Array<[string, string]> = [
  ["version", "INTEGER NOT NULL DEFAULT 1"], ["created_by_device_id", "TEXT NOT NULL DEFAULT ''"], ["created_by_name", "TEXT NOT NULL DEFAULT ''"], ["created_by_team", "TEXT NOT NULL DEFAULT ''"],
  ["updated_by_device_id", "TEXT NOT NULL DEFAULT ''"], ["updated_by_name", "TEXT NOT NULL DEFAULT ''"], ["updated_by_team", "TEXT NOT NULL DEFAULT ''"],
  ["deleted_at", "TEXT"], ["deleted_by_device_id", "TEXT"], ["deleted_by_name", "TEXT"], ["deleted_by_team", "TEXT"],
];
const categoryColumns: Array<[string, string]> = [["sort_order", "INTEGER NOT NULL DEFAULT 0"]];

export async function ensureDatabase() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  if (!initialized) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'uncategorized',
      inbox INTEGER NOT NULL DEFAULT 1,
      favorite INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      created_by_device_id TEXT NOT NULL DEFAULT '', created_by_name TEXT NOT NULL DEFAULT '', created_by_team TEXT NOT NULL DEFAULT '',
      updated_by_device_id TEXT NOT NULL DEFAULT '', updated_by_name TEXT NOT NULL DEFAULT '', updated_by_team TEXT NOT NULL DEFAULT '',
      deleted_at TEXT, deleted_by_device_id TEXT, deleted_by_name TEXT, deleted_by_team TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(items)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  for (const [name, definition] of itemColumns) if (!names.has(name)) await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${name} ${definition}`).run();
  await env.DB.batch([
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_inbox_updated ON items (inbox, updated_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_favorite_updated ON items (favorite, updated_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_category ON items (category)",
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_items_deleted_updated ON items (deleted_at, updated_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS item_versions (
      id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, version_number INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, inbox INTEGER NOT NULL, favorite INTEGER NOT NULL,
      deleted_at TEXT, actor_device_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_team TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_item_versions_item_created ON item_versions (item_id, created_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL DEFAULT 'item', entity_id TEXT NOT NULL,
      summary TEXT NOT NULL, actor_device_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_team TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events (created_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, object_key TEXT NOT NULL, filename TEXT NOT NULL,
      content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_by_name TEXT NOT NULL, uploaded_by_team TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_attachments_item_created ON attachments (item_id, created_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'neutral', created_by_name TEXT NOT NULL, created_by_team TEXT NOT NULL, created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS item_tags (item_id TEXT NOT NULL, tag_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (item_id, tag_id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags (item_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags (tag_id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, body TEXT NOT NULL, author_name TEXT NOT NULL, author_team TEXT NOT NULL, created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_item_created ON comments (item_id, created_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT 'neutral', created_by_name TEXT NOT NULL, created_by_team TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_categories_active_name ON categories (archived_at, name)"),
    env.DB.prepare("INSERT OR IGNORE INTO categories (id, name, normalized_name, color, created_by_name, created_by_team, created_at) SELECT lower(hex(randomblob(16))), trim(category), lower(trim(category)), 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP FROM items WHERE trim(category) != ''"),
    env.DB.prepare("UPDATE items SET version = 1 WHERE version IS NULL OR version < 1"),
    env.DB.prepare("UPDATE items SET created_by_name = 'KLANG', created_by_team = 'ทีม' WHERE created_by_name = ''"),
    env.DB.prepare("UPDATE items SET updated_by_name = created_by_name, updated_by_team = created_by_team WHERE updated_by_name = ''"),
  ]);
  const categoryInfo = await env.DB.prepare("PRAGMA table_info(categories)").all<{ name: string }>();
  const categoryNames = new Set(categoryInfo.results.map((column) => column.name));
  for (const [name, definition] of categoryColumns) if (!categoryNames.has(name)) await env.DB.prepare(`ALTER TABLE categories ADD COLUMN ${name} ${definition}`).run();
  await env.DB.batch([
    env.DB.prepare("WITH ranked AS (SELECT id, name, normalized_name, ROW_NUMBER() OVER (PARTITION BY normalized_name ORDER BY created_at ASC, id ASC) AS position FROM categories) UPDATE items SET category = COALESCE((SELECT name FROM ranked WHERE ranked.normalized_name = lower(trim(items.category)) AND ranked.position = 1), category) WHERE EXISTS (SELECT 1 FROM ranked WHERE ranked.normalized_name = lower(trim(items.category)))"),
    env.DB.prepare("DELETE FROM categories WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY normalized_name ORDER BY created_at ASC, id ASC) AS position FROM categories) WHERE position > 1)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_normalized_name_unique ON categories (normalized_name)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_categories_active_order ON categories (archived_at, sort_order)"),
    env.DB.prepare("UPDATE categories SET sort_order = rowid WHERE sort_order = 0"),
    env.DB.prepare("INSERT OR IGNORE INTO categories (id, name, normalized_name, sort_order, color, created_by_name, created_by_team, created_at) VALUES ('system-uncategorized', 'uncategorized', 'uncategorized', -1, 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP), ('system-project', 'project', 'project', 10, 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP), ('system-team', 'team', 'team', 20, 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP), ('system-idea', 'idea', 'idea', 30, 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP), ('system-reference', 'reference', 'reference', 40, 'neutral', 'KLANG', 'ทีม', CURRENT_TIMESTAMP)"),
  ]);

  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM items").first<{
    total: number;
  }>();

  if (!count?.total) {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO items (id, type, title, content, url, category, inbox, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "welcome-note",
        "note",
        "ยินดีต้อนรับสู่ KLANG",
        "เริ่มเก็บโน้ต ลิงก์ และเอกสารของทีมได้จากปุ่มเพิ่มรายการ ทุกอย่างใหม่จะเข้ามาที่ Inbox ก่อน",
        "",
        "team",
        1,
        1,
        now,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO items (id, type, title, content, url, category, inbox, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "example-link",
        "link",
        "คู่มือการทำงานของทีม",
        "ลิงก์ตัวอย่างสำหรับเอกสารอ้างอิงที่ทีมเปิดใช้บ่อย",
        "https://example.com/team-handbook",
        "reference",
        1,
        0,
        now,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO items (id, type, title, content, url, category, inbox, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        "example-document",
        "document",
        "แผนงานประจำสัปดาห์",
        "เป้าหมายหลัก\n• สรุปงานที่กำลังทำ\n• บันทึกการตัดสินใจ\n• ระบุสิ่งที่ต้องติดตาม",
        "",
        "project",
        0,
        0,
        now,
        now,
      ),
    ]);
  }

  initialized = true;
  }
  const nowMs = Date.now();
  if (nowMs - lastMaintenanceAt > 12 * 60 * 60 * 1000) {
    const expiry = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM item_versions WHERE item_id IN (SELECT id FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?)").bind(expiry),
      env.DB.prepare("DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?").bind(expiry),
      env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(nowMs - 24 * 60 * 60 * 1000),
      env.DB.prepare("PRAGMA optimize"),
    ]);
    lastMaintenanceAt = nowMs;
  }
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getRawDb() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export function getFiles() {
  if (!env.FILES) throw new Error("Cloudflare R2 binding `FILES` is unavailable.");
  return env.FILES as R2Bucket;
}
