import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'uncategorized',
      inbox INTEGER NOT NULL DEFAULT 1,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_inbox_updated ON items (inbox, updated_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_favorite_updated ON items (favorite, updated_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_items_category ON items (category)",
    ),
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

  await env.DB.prepare("PRAGMA optimize").run();
  initialized = true;
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
