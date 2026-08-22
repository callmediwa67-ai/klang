import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getRawDb } from "../../../db";
import { categories } from "../../../db/schema";

type Actor = { deviceId: string; name: string; team: string };
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : ""; }
function actor(value: unknown): Actor | null { const raw = value as Record<string, unknown> | null; const result = { deviceId: clean(raw?.deviceId, 100), name: clean(raw?.name, 80), team: clean(raw?.team, 80) }; return result.deviceId && result.name && result.team ? result : null; }
function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }

async function recordBulkActivity(who: Actor, action: string, categoryId: string, summary: string) {
  await getRawDb().prepare("INSERT INTO activity_events (id, action, entity_type, entity_id, summary, actor_device_id, actor_name, actor_team, created_at) VALUES (?, ?, 'category', ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), action, categoryId, summary, who.deviceId, who.name, who.team, new Date().toISOString()).run();
}

async function snapshotAndMoveItems(from: string, to: string, who: Actor) {
  const d1 = getRawDb(); const now = new Date().toISOString();
  await d1.batch([
    d1.prepare("INSERT INTO item_versions (id, item_id, version_number, type, title, content, url, category, inbox, favorite, deleted_at, actor_device_id, actor_name, actor_team, created_at) SELECT lower(hex(randomblob(16))), id, version, type, title, content, url, category, inbox, favorite, deleted_at, ?, ?, ?, ? FROM items WHERE category = ?").bind(who.deviceId, who.name, who.team, now, from),
    d1.prepare("UPDATE items SET category = ?, version = version + 1, updated_at = ?, updated_by_device_id = ?, updated_by_name = ?, updated_by_team = ? WHERE category = ?").bind(to, now, who.deviceId, who.name, who.team, from),
  ]);
}

export async function GET() {
  try {
    await ensureDatabase();
    const result = await getRawDb().prepare("SELECT c.*, COUNT(i.id) AS item_count FROM categories c LEFT JOIN items i ON i.category = c.name GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC").all<Record<string, unknown>>();
    return Response.json({ categories: result.results.filter((category) => !category.archived_at).map((category) => ({ id: category.id, name: category.name, normalizedName: category.normalized_name, sortOrder: Number(category.sort_order ?? 0), color: category.color, createdByName: category.created_by_name, createdByTeam: category.created_by_team, createdAt: category.created_at, itemCount: Number(category.item_count ?? 0) })) });
  } catch { return fail("เปิดหมวดหมู่ไม่สำเร็จ", 500); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase(); const payload = await request.json() as Record<string, unknown>; const who = actor(payload.actor); const name = clean(payload.name, 40);
    if (!who || !name) return fail("กรุณาระบุชื่อ ทีม และหมวดหมู่");
    const normalizedName = name.toLocaleLowerCase("th"); const existing = await getDb().select().from(categories).where(eq(categories.normalizedName, normalizedName));
    if (existing[0]) {
      if (existing[0].archivedAt) await getDb().update(categories).set({ archivedAt: null, name }).where(eq(categories.id, existing[0].id));
      return Response.json({ category: { ...existing[0], name, archivedAt: null }, existing: true });
    }
    const max = await getRawDb().prepare("SELECT MAX(sort_order) AS value FROM categories").first<{ value: number | null }>(); const [category] = await getDb().insert(categories).values({ id: crypto.randomUUID(), name, normalizedName, sortOrder: (max?.value ?? 0) + 10, color: "neutral", createdByName: who.name, createdByTeam: who.team, createdAt: new Date().toISOString() }).returning();
    await recordBulkActivity(who, "category_created", category.id, `สร้างหมวดหมู่ ${name}`);
    return Response.json({ category: { ...category, itemCount: 0 } }, { status: 201 });
  } catch { return fail("สร้างหมวดหมู่ไม่สำเร็จ", 500); }
}

export async function PATCH(request: Request) {
  try {
    await ensureDatabase(); const payload = await request.json() as Record<string, unknown>; const who = actor(payload.actor); const orderedIds = Array.isArray(payload.orderedIds) ? payload.orderedIds.map((value) => clean(value, 100)).filter(Boolean).slice(0, 500) : []; const id = clean(payload.id, 100); const name = clean(payload.name, 40);
    if (!who) return fail("กรุณาระบุชื่อและทีมก่อนจัดการหมวดหมู่");
    if (orderedIds.length) { await getRawDb().batch(orderedIds.map((categoryId, index) => getRawDb().prepare("UPDATE categories SET sort_order = ? WHERE id = ? AND archived_at IS NULL").bind(index * 10, categoryId))); await recordBulkActivity(who, "category_reordered", orderedIds[0], "เรียงลำดับหมวดหมู่ใหม่"); return Response.json({ ok: true }); }
    if (!id || !name) return fail("กรุณาระบุหมวดหมู่ใหม่ให้ครบ");
    const [current] = await getDb().select().from(categories).where(eq(categories.id, id)); if (!current || current.archivedAt) return fail("ไม่พบหมวดหมู่นี้", 404);
    const normalizedName = name.toLocaleLowerCase("th"); const [duplicate] = await getDb().select().from(categories).where(eq(categories.normalizedName, normalizedName));
    if (duplicate && duplicate.id !== id) return fail("มีหมวดหมู่ชื่อนี้อยู่แล้ว", 409);
    if (current.name !== name) await snapshotAndMoveItems(current.name, name, who);
    await getDb().update(categories).set({ name, normalizedName }).where(eq(categories.id, id));
    await recordBulkActivity(who, "category_renamed", id, `เปลี่ยนชื่อหมวดหมู่ ${current.name} เป็น ${name}`);
    return Response.json({ ok: true, category: { ...current, name, normalizedName } });
  } catch { return fail("เปลี่ยนชื่อหมวดหมู่ไม่สำเร็จ", 500); }
}

export async function DELETE(request: Request) {
  try {
    await ensureDatabase(); const payload = await request.json() as Record<string, unknown>; const who = actor(payload.actor); const id = clean(payload.id, 100); const replacement = clean(payload.replacementCategory, 40) || "uncategorized";
    if (!who || !id) return fail("ไม่พบหมวดหมู่ที่ต้องการลบ");
    const [current] = await getDb().select().from(categories).where(eq(categories.id, id)); if (!current || current.archivedAt) return fail("ไม่พบหมวดหมู่นี้", 404);
    if (current.name === replacement) return fail("กรุณาเลือกหมวดหมู่ปลายทางอื่น");
    await snapshotAndMoveItems(current.name, replacement, who);
    await getDb().update(categories).set({ archivedAt: new Date().toISOString() }).where(eq(categories.id, id));
    await recordBulkActivity(who, "category_archived", id, `ลบหมวดหมู่ ${current.name} และย้ายรายการไป ${replacement}`);
    return Response.json({ ok: true });
  } catch { return fail("ลบหมวดหมู่ไม่สำเร็จ", 500); }
}
