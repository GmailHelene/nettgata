import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * For oppetidsvarsling (for eksempel UptimeRobot eller Better Stack): svarer 200 når appen og databasen virker,
 * og 503 når databasen ikke svarer. Viser ingen detaljer som kan hjelpe en angriper.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("tidsavbrudd")), 5000))]);
    return Response.json({ status: "ok", ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("Helsesjekken feilet", err);
    return Response.json({ status: "feil" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
