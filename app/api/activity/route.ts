import { desc } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { activityEvents } from "../../../db/schema";

export async function GET() {
  try { await ensureDatabase(); return Response.json({ events: await getDb().select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(100) }); }
  catch (reason) { console.error(reason); return Response.json({ error: "เปิดความเคลื่อนไหวไม่สำเร็จ" }, { status: 500 }); }
}
