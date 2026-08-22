import { desc } from "drizzle-orm";
import { ensureDatabase, getDb, getRawDb } from "../../../db";
import { activityEvents, attachments, itemVersions, items } from "../../../db/schema";

const tables = [{ sql: "items", key: "items" }, { sql: "item_versions", key: "itemVersions" }, { sql: "activity_events", key: "activityEvents" }, { sql: "attachments", key: "attachments" }] as const;
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function fail(error: string, status = 400) { return Response.json({ error }, { status }); }
function actorFrom(value: unknown) { const raw = value as Record<string, unknown> | null; return raw ? { deviceId: clean(raw.deviceId, 100), name: clean(raw.name, 80), team: clean(raw.team, 80) } : null; }

export async function GET() {
  try {
    await ensureDatabase(); const db = getDb();
    const backup = { format: "klang-backup", version: 1, exportedAt: new Date().toISOString(), note: "Attachment file bytes are not embedded. Download attached files separately before a full archival backup.", data: { items: await db.select().from(items).orderBy(desc(items.createdAt)), itemVersions: await db.select().from(itemVersions).orderBy(desc(itemVersions.createdAt)), activityEvents: await db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)), attachments: await db.select().from(attachments).orderBy(desc(attachments.createdAt)) } };
    return new Response(JSON.stringify(backup, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="klang-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch (reason) { console.error(reason); return fail("สร้างไฟล์สำรองไม่สำเร็จ", 500); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase(); const payload = await request.json() as { actor?: unknown; backup?: { format?: string; version?: number; data?: Record<string, unknown[]> } }; const actor = actorFrom(payload.actor);
    if (!actor?.deviceId || !actor.name || !actor.team) return fail("กรุณาระบุชื่อและทีมก่อนกู้คืนข้อมูล"); if (payload.backup?.format !== "klang-backup" || payload.backup.version !== 1 || !payload.backup.data) return fail("ไฟล์สำรอง KLANG ไม่ถูกต้อง");
    const d1 = getRawDb(); const restored: Record<string, number> = {};
    for (const table of tables) {
      const rows = Array.isArray(payload.backup.data[table.key]) ? payload.backup.data[table.key]! : [];
      let count = 0;
      for (const row of rows.slice(0, 5_000)) {
        if (!row || typeof row !== "object") continue; const values = row as Record<string, unknown>; const columns = Object.keys(values).filter((column) => /^[a-zA-Z_]+$/.test(column)); if (!columns.length) continue;
        const statement = `INSERT OR IGNORE INTO ${table.sql} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`; await d1.prepare(statement).bind(...columns.map((column) => values[column] ?? null)).run(); count++;
      }
      restored[table.key] = count;
    }
    await d1.prepare("INSERT INTO activity_events (id, action, entity_type, entity_id, summary, actor_device_id, actor_name, actor_team, created_at) VALUES (?, 'backup_restored', 'backup', ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), "กู้คืนข้อมูลจากไฟล์สำรอง", actor.deviceId, actor.name, actor.team, new Date().toISOString()).run();
    return Response.json({ ok: true, restored, warning: "กู้คืนข้อมูลรายการและประวัติแล้ว ไฟล์แนบต้องอัปโหลดกลับแยกต่างหาก" });
  } catch (reason) { console.error(reason); return fail("กู้คืนข้อมูลไม่สำเร็จ", 500); }
}
