import { getDb } from "@/db";
import { csvResponse } from "@/lib/csv";
import { subscribersCsv } from "@/lib/nyhetsbrev/subscribers";
import { osloDate } from "@/lib/oslo-time";
import { checkSiteAccess } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  return csvResponse(await subscribersCsv(await getDb(), access.site.id), `nyhetsbrev-${access.site.slug}-${osloDate(new Date())}.csv`);
}
