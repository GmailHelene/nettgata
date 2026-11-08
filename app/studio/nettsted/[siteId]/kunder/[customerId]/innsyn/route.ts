import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { checkSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";
import { customerDataExport } from "@/lib/shop/personvern";

/**
 * «Last ned alt om kunden» (GDPR artikkel 15 og 20). Bare eieren, som med «Last ned alt» for hele nettstedet,
 * fordi filen er alt butikken vet om én person. Nedlastingen logges uten personopplysninger.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; customerId: string }> }) {
  const { siteId, customerId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access || access.role !== "owner") return new Response("Bare eieren kan laste ned opplysningene om en kunde.", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(customerId)) return new Response("Fant ikke kunden", { status: 404 });
  const db = await getDb();
  try {
    const data = await customerDataExport(db, access.site.id, customerId);
    await db.insert(auditLog).values({ siteId: access.site.id, userId: access.user.id, action: "customer.exported", detail: { customerId } });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="kundeopplysninger-${customerId.slice(0, 8)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ShopError) return new Response(err.message, { status: 404 });
    throw err;
  }
}
