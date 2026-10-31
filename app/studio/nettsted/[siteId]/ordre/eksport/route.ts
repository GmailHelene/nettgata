import { getDb } from "@/db";
import { csvResponse } from "@/lib/csv";
import { osloDate } from "@/lib/oslo-time";
import { checkSiteAccess } from "@/lib/session";
import { listOrders, ordersCsv, parseOrderQuery } from "@/lib/shop/admin";

/** Ordrene som vises i listen, med samme filter og søk, som CSV for Excel eller regnskap. */
export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  const query = parseOrderQuery(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await listOrders(await getDb(), access.site.id, { ...query, page: 1 }, 20_000);
  return csvResponse(ordersCsv(rows), `ordre-${access.site.slug}-${osloDate(new Date())}.csv`);
}
