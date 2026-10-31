import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { emailPreview } from "@/lib/email/send";
import { checkSiteAccess } from "@/lib/session";

/** Forhåndsvisning av en e-post, bare lokalt. I produksjon lagres ikke innholdet, og ruten svarer 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ logId: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response("Ikke funnet", { status: 404 });
  const { logId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(logId)) return new Response("Ikke funnet", { status: 404 });
  const [row] = await (await getDb()).select({ siteId: emailLog.siteId }).from(emailLog).where(eq(emailLog.id, logId)).limit(1);
  if (!row || !(await checkSiteAccess(row.siteId))) return new Response("Ikke funnet", { status: 404 });
  const preview = emailPreview(logId);
  if (!preview) return new Response("Forhåndsvisningen ligger bare i minnet til utviklingsserveren startes på nytt.", { status: 404 });
  return new Response(preview.html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
