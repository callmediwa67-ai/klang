import { and, asc, eq } from "drizzle-orm";
import { ensureDatabase, getDb, getFiles, getRawDb } from "../../../db";
import { attachments, items } from "../../../db/schema";

const allowedTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxBytes = 15 * 1024 * 1024;
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function fail(error: string, status = 400) { return Response.json({ error }, { status }); }

export async function GET(request: Request) {
  try {
    await ensureDatabase(); const query = new URL(request.url).searchParams; const id = clean(query.get("id"), 100); const itemId = clean(query.get("itemId"), 100);
    if (itemId) return Response.json({ attachments: await getDb().select().from(attachments).where(eq(attachments.itemId, itemId)).orderBy(asc(attachments.createdAt)) });
    if (!id) return fail("ไม่พบไฟล์", 404);
    const [file] = await getDb().select().from(attachments).where(eq(attachments.id, id)); if (!file) return fail("ไม่พบไฟล์", 404);
    const object = await getFiles().get(file.objectKey); if (!object) return fail("ไม่พบไฟล์ในคลัง", 404);
    return new Response(object.body, { headers: { "content-type": file.contentType, "content-length": String(file.size), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "cache-control": "public, max-age=3600" } });
  } catch (reason) { console.error(reason); return fail("เปิดไฟล์ไม่สำเร็จ", 500); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase(); const form = await request.formData(); const rawActor = JSON.parse(clean(form.get("actor"), 500) || "{}") as Record<string, unknown>;
    const actor = { deviceId: clean(rawActor.deviceId, 100), name: clean(rawActor.name, 80), team: clean(rawActor.team, 80) }; const itemId = clean(form.get("itemId"), 100); const file = form.get("file");
    if (!actor.deviceId || !actor.name || !actor.team) return fail("กรุณาระบุชื่อและทีมก่อนอัปโหลด"); if (!itemId || !(file instanceof File)) return fail("กรุณาเลือกรายการและไฟล์"); if (!allowedTypes.has(file.type) || file.size > maxBytes) return fail("รองรับ PDF, Word และรูปภาพ ขนาดไม่เกิน 15 MB");
    const [item] = await getDb().select({ id: items.id }).from(items).where(and(eq(items.id, itemId))); if (!item) return fail("ไม่พบรายการที่ต้องการแนบไฟล์", 404);
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const filename = clean(file.name, 180) || "attachment"; const objectKey = `attachments/${id}/${filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}`;
    await getFiles().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    const [attachment] = await getDb().insert(attachments).values({ id, itemId, objectKey, filename, contentType: file.type, size: file.size, uploadedByName: actor.name, uploadedByTeam: actor.team, createdAt: now }).returning();
    return Response.json({ attachment }, { status: 201 });
  } catch (reason) { console.error(reason); return fail("อัปโหลดไฟล์ไม่สำเร็จ", 500); }
}

export async function DELETE(request: Request) {
  try {
    await ensureDatabase(); const payload = await request.json() as Record<string, unknown>; const id = clean(payload.id, 100); const rawActor = payload.actor as Record<string, unknown> | null;
    const actor = { deviceId: clean(rawActor?.deviceId, 100), name: clean(rawActor?.name, 80), team: clean(rawActor?.team, 80) };
    if (!actor.deviceId || !actor.name || !actor.team) return fail("กรุณาระบุชื่อและทีมก่อนลบไฟล์"); if (!id) return fail("ไม่พบไฟล์ที่ต้องการลบ");
    const [file] = await getDb().select().from(attachments).where(eq(attachments.id, id)); if (!file) return fail("ไม่พบไฟล์", 404);
    await getFiles().delete(file.objectKey); await getDb().delete(attachments).where(eq(attachments.id, id));
    await getRawDb().prepare("INSERT INTO activity_events (id, action, entity_type, entity_id, summary, actor_device_id, actor_name, actor_team, created_at) VALUES (?, 'attachment_deleted', 'attachment', ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), file.id, `ลบไฟล์แนบ ${file.filename}`, actor.deviceId, actor.name, actor.team, new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (reason) { console.error(reason); return fail("ลบไฟล์ไม่สำเร็จ", 500); }
}
