import { and, desc, eq, isNull } from "drizzle-orm";
import { ensureDatabase, getDb, getRawDb } from "../../../db";
import { items, itemVersions, type VaultItem } from "../../../db/schema";

const itemTypes = new Set(["note", "link", "document"]);
const categories = new Set(["uncategorized", "project", "team", "idea", "reference"]);
type Actor = { deviceId: string; name: string; team: string };
function cleanText(value: unknown, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function validUrl(value: string) { if (!value) return ""; try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function error(message: string, status = 400) { return Response.json({ error: message }, { status }); }
function parseActor(value: unknown): Actor | null { const raw = value as Record<string, unknown> | null; if (!raw) return null; const actor = { deviceId: cleanText(raw.deviceId, 100), name: cleanText(raw.name, 80), team: cleanText(raw.team, 80) }; return actor.deviceId && actor.name && actor.team ? actor : null; }
async function fingerprint(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (part) => part.toString(16).padStart(2, "0")).join("").slice(0, 32); }
async function enforceWriteRateLimit(request: Request, actor: Actor) {
  const db = getRawDb(); const now = Date.now(); const threshold = now - 60_000;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const keys: Array<[string, number]> = [[`write:device:${await fingerprint(actor.deviceId)}`, 30], [`write:ip:${await fingerprint(ip)}`, 80], ["write:global", 300]];
  for (const [key, limit] of keys) {
    const result = await db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END, count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END RETURNING count`).bind(key, now, threshold, threshold).all<{ count: number }>();
    if ((result.results[0]?.count ?? 0) > limit) return false;
  }
  return true;
}
async function recordVersion(item: VaultItem, actor: Actor) { await getDb().insert(itemVersions).values({ id: crypto.randomUUID(), itemId: item.id, versionNumber: item.version, type: item.type, title: item.title, content: item.content, url: item.url, category: item.category, inbox: item.inbox, favorite: item.favorite, deletedAt: item.deletedAt, actorDeviceId: actor.deviceId, actorName: actor.name, actorTeam: actor.team, createdAt: new Date().toISOString() }); }
async function recordActivity(actor: Actor, action: string, item: VaultItem) { await getRawDb().prepare("INSERT INTO activity_events (id, action, entity_type, entity_id, summary, actor_device_id, actor_name, actor_team, created_at) VALUES (?, ?, 'item', ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), action, item.id, item.title, actor.deviceId, actor.name, actor.team, new Date().toISOString()).run(); }
function serverError(reason: unknown) { console.error(reason); return error("เชื่อมต่อคลังข้อมูลไม่ได้ กรุณาลองอีกครั้ง", 500); }

export async function GET(request: Request) {
  try { await ensureDatabase(); const query = new URL(request.url).searchParams; const id = cleanText(query.get("id"), 100);
    if (query.get("history") === "1" && id) { const [item] = await getDb().select().from(items).where(eq(items.id, id)); if (!item) return error("ไม่พบรายการนี้", 404); const versions = await getDb().select().from(itemVersions).where(eq(itemVersions.itemId, id)).orderBy(desc(itemVersions.versionNumber)); return Response.json({ item, versions }); }
    const trash = query.get("view") === "trash"; const rows = await getDb().select().from(items).where(trash ? undefined : isNull(items.deletedAt)).orderBy(desc(items.updatedAt), desc(items.createdAt)).limit(250); return Response.json({ items: trash ? rows.filter((row) => row.deletedAt) : rows });
  } catch (reason) { return serverError(reason); }
}

export async function POST(request: Request) {
  try { const payload = await request.json() as Record<string, unknown>; const actor = parseActor(payload.actor); if (!actor) return error("กรุณาระบุชื่อและทีมก่อนบันทึก"); await ensureDatabase(); if (!await enforceWriteRateLimit(request, actor)) return error("ทำรายการเร็วเกินไป กรุณารอสักครู่", 429);
    const type = cleanText(payload.type, 20); const title = cleanText(payload.title, 160); const content = cleanText(payload.content, 12_000); const category = cleanText(payload.category, 40) || "uncategorized"; const url = validUrl(cleanText(payload.url, 2_000));
    if (!itemTypes.has(type) || !title) return error("กรุณาระบุประเภทรายการและชื่อ"); if (!categories.has(category)) return error("หมวดหมู่ไม่ถูกต้อง"); if (type === "link" && !url) return error("กรุณาใส่ลิงก์ http หรือ https ที่ถูกต้อง");
    const now = new Date().toISOString(); const [item] = await getDb().insert(items).values({ id: crypto.randomUUID(), type: type as VaultItem["type"], title, content, url, category, inbox: true, favorite: false, version: 1, createdAt: now, updatedAt: now, createdByDeviceId: actor.deviceId, createdByName: actor.name, createdByTeam: actor.team, updatedByDeviceId: actor.deviceId, updatedByName: actor.name, updatedByTeam: actor.team }).returning(); await recordVersion(item, actor); await recordActivity(actor, "created", item); return Response.json({ item }, { status: 201 });
  } catch (reason) { return serverError(reason); }
}

export async function PATCH(request: Request) {
  try { const payload = await request.json() as Record<string, unknown>; const actor = parseActor(payload.actor); const id = cleanText(payload.id, 100); const expectedVersion = Number(payload.expectedVersion);
    if (!actor) return error("กรุณาระบุชื่อและทีมก่อนบันทึก"); if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) return error("ข้อมูลเวอร์ชันสำหรับการแก้ไขไม่ครบถ้วน"); await ensureDatabase(); if (!await enforceWriteRateLimit(request, actor)) return error("ทำรายการเร็วเกินไป กรุณารอสักครู่", 429);
    const [current] = await getDb().select().from(items).where(eq(items.id, id)); if (!current) return error("ไม่พบรายการนี้", 404); const now = new Date().toISOString(); let changes: Partial<typeof items.$inferInsert> = { version: expectedVersion + 1, updatedAt: now, updatedByDeviceId: actor.deviceId, updatedByName: actor.name, updatedByTeam: actor.team }; let action = "updated";
    if (payload.operation === "restore") { changes = { ...changes, deletedAt: null, deletedByDeviceId: null, deletedByName: null, deletedByTeam: null }; action = "restored"; }
    else if (typeof payload.restoreVersionId === "string") { const [snapshot] = await getDb().select().from(itemVersions).where(and(eq(itemVersions.id, cleanText(payload.restoreVersionId, 100)), eq(itemVersions.itemId, id))); if (!snapshot) return error("ไม่พบประวัติที่ต้องการกู้คืน", 404); changes = { ...changes, type: snapshot.type as VaultItem["type"], title: snapshot.title, content: snapshot.content, url: snapshot.url, category: snapshot.category, inbox: snapshot.inbox, favorite: snapshot.favorite, deletedAt: null, deletedByDeviceId: null, deletedByName: null, deletedByTeam: null }; action = "version_restored"; }
    else { if (current.deletedAt) return error("รายการนี้อยู่ในถังขยะแล้ว", 409); if (typeof payload.title === "string") { const title = cleanText(payload.title, 160); if (!title) return error("ชื่อรายการห้ามว่าง"); changes.title = title; } if (typeof payload.content === "string") changes.content = cleanText(payload.content, 12_000); if (typeof payload.url === "string") { const url = validUrl(cleanText(payload.url, 2_000)); if (payload.url && !url) return error("ลิงก์ไม่ถูกต้อง"); changes.url = url; } if (typeof payload.category === "string") { const category = cleanText(payload.category, 40); if (!categories.has(category)) return error("หมวดหมู่ไม่ถูกต้อง"); changes.category = category; } if (typeof payload.inbox === "boolean") changes.inbox = payload.inbox; if (typeof payload.favorite === "boolean") changes.favorite = payload.favorite; }
    const [item] = await getDb().update(items).set(changes).where(and(eq(items.id, id), eq(items.version, expectedVersion))).returning(); if (!item) { const [latest] = await getDb().select().from(items).where(eq(items.id, id)); return Response.json({ error: "มีคนแก้ไขรายการนี้ก่อนคุณ", current: latest }, { status: 409 }); } await recordVersion(item, actor); await recordActivity(actor, action, item); return Response.json({ item });
  } catch (reason) { return serverError(reason); }
}

export async function DELETE(request: Request) {
  try { const payload = await request.json() as Record<string, unknown>; const actor = parseActor(payload.actor); const id = cleanText(payload.id, 100); const expectedVersion = Number(payload.expectedVersion); if (!actor) return error("กรุณาระบุชื่อและทีมก่อนบันทึก"); if (!id || !Number.isInteger(expectedVersion)) return error("ข้อมูลเวอร์ชันสำหรับการลบไม่ครบถ้วน"); await ensureDatabase(); if (!await enforceWriteRateLimit(request, actor)) return error("ทำรายการเร็วเกินไป กรุณารอสักครู่", 429);
    const now = new Date().toISOString(); const [item] = await getDb().update(items).set({ deletedAt: now, deletedByDeviceId: actor.deviceId, deletedByName: actor.name, deletedByTeam: actor.team, updatedAt: now, updatedByDeviceId: actor.deviceId, updatedByName: actor.name, updatedByTeam: actor.team, version: expectedVersion + 1 }).where(and(eq(items.id, id), eq(items.version, expectedVersion), isNull(items.deletedAt))).returning(); if (!item) { const [current] = await getDb().select().from(items).where(eq(items.id, id)); if (!current) return error("ไม่พบรายการนี้", 404); return Response.json({ error: "มีคนแก้ไขรายการนี้ก่อนคุณ", current }, { status: 409 }); } await recordVersion(item, actor); await recordActivity(actor, "trashed", item); return Response.json({ item });
  } catch (reason) { return serverError(reason); }
}
