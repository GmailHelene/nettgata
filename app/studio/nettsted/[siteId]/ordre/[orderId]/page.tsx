import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { orderStatusLabel } from "../order-status";
import { OrderActions } from "./order-actions";

export default async function OrderPage({ params }: { params: Promise<{ siteId: string; orderId: string }> }) {
  const { siteId, orderId } = await params;
  const { site } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) notFound();
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const status = orderStatusLabel[order.status];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href={`/studio/nettsted/${site.id}/ordre`} className="text-sm underline">
        Alle ordre
      </Link>
      <div className="mb-8 mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Ordre #{order.number}</h1>
        <span className={`rounded-full px-3 py-1 text-sm ${status.className}`}>{status.text}</span>
      </div>

      <OrderActions siteId={site.id} orderId={order.id} status={order.status} />

      <section className="mt-8 rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-semibold">Varer</h2>
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  {l.quantity} × {l.name}
                  {l.variantLabel && <span className="block text-neutral-600">{l.variantLabel}</span>}
                  {l.sku && <span className="block text-xs text-neutral-500">Varenr. {l.sku}</span>}
                </td>
                <td className="py-2 text-right">{formatNok(l.totalOre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Levering: {order.shipping.name}</dt>
            <dd>{formatNok(order.shippingOre)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Totalt</dt>
            <dd>{formatNok(order.totalOre)}</dd>
          </div>
          <div className="flex justify-between text-neutral-600">
            <dt>Herav MVA</dt>
            <dd>{formatNok(order.vatOre)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 grid gap-6 rounded-lg border bg-white p-5 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Kunde</h2>
          <p>{order.customerName}</p>
          <p>
            <a className="underline" href={`mailto:${order.customerEmail}`}>
              {order.customerEmail}
            </a>
          </p>
          {order.customerPhone && (
            <p>
              <a className="underline" href={`tel:${order.customerPhone.replace(/\s/g, "")}`}>
                {order.customerPhone}
              </a>
            </p>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{order.shippingAddress ? "Leveringsadresse" : "Levering"}</h2>
          {order.shippingAddress ? (
            <address className="not-italic">
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
            </address>
          ) : (
            <p>{order.shipping.name}</p>
          )}
          <p className="mt-2 text-sm text-neutral-600">Betaling: {paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}</p>
        </div>
        {order.note && (
          <div className="sm:col-span-2">
            <h2 className="mb-2 font-semibold">Melding fra kunden</h2>
            <p className="whitespace-pre-line">{order.note}</p>
          </div>
        )}
      </section>

      <p className="mt-6 text-sm text-neutral-600">
        Bestilt {order.createdAt.toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}
        {order.paidAt && ` · betalt ${order.paidAt.toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}`}
        {order.fulfilledAt && ` · sendt ${order.fulfilledAt.toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}`}
      </p>
    </main>
  );
}
