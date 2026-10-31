import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { PrintButton } from "@/components/studio/print-button";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatOrgnr, readSiteInfo } from "@/lib/site-info";

/** Pakkseddel som legges i pakken. Uten priser, så den også passer når varene er en gave. */
export default async function PackingSlipPage({ params }: { params: Promise<{ siteId: string; orderId: string }> }) {
  const { siteId, orderId } = await params;
  const { site } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) notFound();
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const info = readSiteInfo(site.info);

  return (
    <main className="mx-auto max-w-2xl bg-white px-8 py-10 print:max-w-none print:p-0">
      <div className="mb-8 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="mb-8 flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-xl font-bold">{site.name}</p>
          {info.email && <p className="text-sm">{info.email}</p>}
          {info.phone && <p className="text-sm">{info.phone}</p>}
          {info.orgnr && <p className="text-sm">Org.nr. {formatOrgnr(info.orgnr)}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">Pakkseddel</h1>
          <p>Ordre #{order.number}</p>
          <p className="text-sm text-neutral-600">Bestilt {formatOsloDateTime(order.createdAt)}</p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-600">{order.shippingAddress ? "Leveres til" : "Hentes av"}</h2>
        <address className="not-italic">
          {order.shippingAddress?.name ?? order.customerName}
          {order.shippingAddress && (
            <>
              <br />
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
            </>
          )}
        </address>
        <p className="mt-1 text-sm">Levering: {order.shipping.name}</p>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-neutral-900 text-left text-sm">
            <th className="py-2 pr-3">Vare</th>
            <th className="py-2 pr-3">Varenr.</th>
            <th className="py-2 text-right">Antall</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-3">
                {l.name}
                {l.variantLabel && <span className="block text-sm text-neutral-600">{l.variantLabel}</span>}
              </td>
              <td className="py-2 pr-3 text-sm">{l.sku ?? ""}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{l.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {order.note && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-600">Melding fra kunden</h2>
          <p className="whitespace-pre-line">{order.note}</p>
        </section>
      )}

      <p className="mt-10 text-sm text-neutral-700">
        Takk for handelen! Vil du returnere noe, se angreretten i kjøpsvilkårene på nettsiden vår, eller ta kontakt
        {info.email ? ` på ${info.email}` : ""}.
      </p>
    </main>
  );
}
