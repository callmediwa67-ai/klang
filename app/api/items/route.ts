import { desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { items } from "../../../db/schema";

const itemTypes = new Set(["note", "link", "document"]);
const categories = new Set([
  "uncategorized",
  "project",
  "team",
  "idea",
  "reference",
]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function errorResponse(error: unknown) {
  console.error(error);
  return Response.json(
    { error: "ยังเชื่อมต่อคลังข้อมูลไม่ได้ กรุณาลองอีกครั้ง" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await ensureDatabase();
    const rows = await getDb()
      .select()
      .from(items)
      .orderBy(desc(items.updatedAt), desc(items.createdAt))
      .limit(250);
    return Response.json({ items: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const type = cleanText(payload.type, 20);
    const title = cleanText(payload.title, 160);
    const content = cleanText(payload.content, 12_000);
    const category = cleanText(payload.category, 40) || "uncategorized";
    const url = validUrl(cleanText(payload.url, 2_000));

    if (!itemTypes.has(type) || !title) {
      return Response.json({ error: "กรุณาระบุประเภทและชื่อรายการ" }, { status: 400 });
    }
    if (!categories.has(category)) {
      return Response.json({ error: "หมวดหมู่ไม่ถูกต้อง" }, { status: 400 });
    }
    if (type === "link" && !url) {
      return Response.json({ error: "กรุณาใส่ลิงก์ http หรือ https ที่ถูกต้อง" }, { status: 400 });
    }

    await ensureDatabase();
    const now = new Date().toISOString();
    const [item] = await getDb()
      .insert(items)
      .values({
        id: crypto.randomUUID(),
        type: type as "note" | "link" | "document",
        title,
        content,
        url,
        category,
        inbox: true,
        favorite: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = cleanText(payload.id, 100);
    if (!id) {
      return Response.json({ error: "ไม่พบรายการที่ต้องการแก้ไข" }, { status: 400 });
    }

    const changes: Partial<typeof items.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (typeof payload.title === "string") {
      const title = cleanText(payload.title, 160);
      if (!title) return Response.json({ error: "ชื่อรายการห้ามว่าง" }, { status: 400 });
      changes.title = title;
    }
    if (typeof payload.content === "string") changes.content = cleanText(payload.content, 12_000);
    if (typeof payload.url === "string") {
      const url = validUrl(cleanText(payload.url, 2_000));
      if (payload.url && !url) {
        return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
      }
      changes.url = url;
    }
    if (typeof payload.category === "string") {
      const category = cleanText(payload.category, 40);
      if (!categories.has(category)) {
        return Response.json({ error: "หมวดหมู่ไม่ถูกต้อง" }, { status: 400 });
      }
      changes.category = category;
    }
    if (typeof payload.inbox === "boolean") changes.inbox = payload.inbox;
    if (typeof payload.favorite === "boolean") changes.favorite = payload.favorite;

    await ensureDatabase();
    const [item] = await getDb()
      .update(items)
      .set(changes)
      .where(eq(items.id, id))
      .returning();

    if (!item) return Response.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return Response.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.slice(0, 100) ?? "";
    if (!id) return Response.json({ error: "ไม่พบรายการที่ต้องการลบ" }, { status: 400 });
    await ensureDatabase();
    const [item] = await getDb().delete(items).where(eq(items.id, id)).returning();
    if (!item) return Response.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
