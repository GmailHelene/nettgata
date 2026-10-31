import { getDb } from "@/db";
import { csvResponse } from "@/lib/csv";
import { osloDate } from "@/lib/oslo-time";
import { checkSiteAccess } from "@/lib/session";
import { customersCsv } from "@/lib/shop/customers";

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  return csvResponse(await customersCsv(await getDb(), access.site.id), `kunder-${access.site.slug}-${osloDate(new Date())}.csv`);
}
