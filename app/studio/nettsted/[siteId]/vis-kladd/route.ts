import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { createPreviewToken } from "@/lib/preview";
import { requireSiteAccess } from "@/lib/session";

/** «Forhåndsvis» på Hjem før nettstedet er ute: åpner kladden av forsiden, ikke «snart klart»-siden besøkende ser. */
export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [home] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.siteId, site.id), eq(pages.path, "/"))).limit(1);
  redirect(home ? `/studio/forhandsvis/${await createPreviewToken(home.id)}` : `/vis/${site.slug}`);
}
