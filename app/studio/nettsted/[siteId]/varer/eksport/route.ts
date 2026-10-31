import { getDb } from "@/db";
import { csvResponse } from "@/lib/csv";
import { osloDate } from "@/lib/oslo-time";
import { checkSiteAccess } from "@/lib/session";
import { productsCsv } from "@/lib/shop/admin";

/** Alle varer med én rad per variant, også arkiverte, så eksporten kan brukes som sikkerhetskopi. */
export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  return csvResponse(await productsCsv(await getDb(), access.site.id), `varer-${access.site.slug}-${osloDate(new Date())}.csv`);
}
