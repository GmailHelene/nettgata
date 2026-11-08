import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { PrintButton } from "@/components/studio/print-button";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { creditNotesForOrder, creditReasonLabel, PARTIAL_REASON } from "@/lib/shop/credit-notes";
import { formatNok } from "@/lib/shop/money";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { formatOrgnr, readSiteInfo } from "@/lib/site-info";

export const metadata: Metadata = { title: "Kreditnota" };

/**
 * Kreditnotaen til utskrift eller PDF (Skriv ut, Lagre som PDF i nettleseren). Samme stil som pakkseddelen.
 * Viser det som er lagret på kreditnotaen, aldri ordren slik den er nå, så utskriften alltid blir lik.
 */
export default async function CreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId, orderId } = await params;
  const { nr } = await searchParams;
  const { site } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) notFound();
  // En ordre kan ha flere kreditnotaer (delvis refusjon). ?nr= velger én, ellers vises den for resten av ordren.
  const all = await creditNotesForOrder(db, site.id, order.id);
  const note = all.find((n) => String(n.number) === nr) ?? all.find((n) => n.reason !== PARTIAL_REASON) ?? all.at(-1);
  if (!note) notFound();
  const info = readSiteInfo(site.info);
  const address = [info.street, [info.postalCode, info.city].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <main className="mx-auto max-w-2xl bg-white px-8 py-10 print:max-w-none print:p-0">
      <div className="mb-8 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="mb-8 flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-xl font-bold">{site.name}</p>
          {address.map((line) => (
            <p key={line} className="text-sm">
              {line}
            </p>
          ))}
          {info.orgnr && (
            <p className="text-sm">
              Org.nr. {formatOrgnr(info.orgnr)}
              {note.vatOre !== 0 && " MVA"}
            </p>
          )}
          {info.email && <p className="text-sm">{info.email}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">Kreditnota</h1>
          <p>Nr. {note.number}</p>
          <p className="text-sm text-neutral-600">Dato {formatOsloDateTime(note.createdAt).split(",")[0]}</p>
          <p className="text-sm text-neutral-600">
            Gjelder ordre #{order.number}, bestilt {formatOsloDateTime(order.createdAt).split(",")[0]}
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-600">Kunde</h2>
        <address className="not-italic">
          {order.customerName}
          {order.shippingAddress && (
            <>
              <br />
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
            </>
          )}
        </address>
        <p className="mt-2 text-sm">
          {creditReasonLabel[note.reason] ?? note.reason}. Betalt med {paymentLabels[note.paymentMethod as PaymentMethod] ?? note.paymentMethod}.
        </p>
      </section>

      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b-2 border-[#173b6c] text-left">
            <th className="py-2 pr-3">Vare</th>
            <th className="py-2 pr-3 text-right">Antall</th>
            {note.vatOre !== 0 && <th className="py-2 pr-3 text-right">MVA</th>}
            <th className="py-2 text-right">Beløp</th>
          </tr>
        </thead>
        <tbody>
          {note.lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="py-2 pr-3">
                {l.name}
                {l.variantLabel && <span className="block text-neutral-600">{l.variantLabel}</span>}
                {l.sku && <span className="block text-xs text-neutral-600">Varenr. {l.sku}</span>}
              </td>
              <td className="py-2 pr-3 text-right">{l.quantity}</td>
              {note.vatOre !== 0 && <td className="py-2 pr-3 text-right">{l.vatRate} %</td>}
              <td className="whitespace-nowrap py-2 text-right">{formatNok(l.totalOre)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm tabular-nums">
        {note.discountOre !== 0 && (
          <div className="flex justify-between gap-4">
            <dt>Rabatt</dt>
            <dd>{formatNok(-note.discountOre)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt>Frakt</dt>
          <dd>{formatNok(note.shippingOre)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-1 font-semibold">
          <dt>Totalt</dt>
          <dd>{formatNok(note.totalOre)}</dd>
        </div>
      </dl>

      {note.vatOre !== 0 && (
        <table className="ml-auto mt-6 w-full max-w-sm text-sm tabular-nums">
          <caption className="mb-1 text-left font-semibold">MVA per sats</caption>
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 font-medium">Sats</th>
              <th className="py-1 text-right font-medium">Grunnlag</th>
              <th className="py-1 text-right font-medium">MVA</th>
            </tr>
          </thead>
          <tbody>
            {note.vat.map((r) => (
              <tr key={r.rate} className="border-b last:border-0">
                <td className="py-1">{r.rate} %</td>
                <td className="whitespace-nowrap py-1 text-right">{formatNok(r.amountOre - r.vatOre)}</td>
                <td className="whitespace-nowrap py-1 text-right">{formatNok(r.vatOre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-10 text-sm text-neutral-700">
        {note.reason === PARTIAL_REASON
          ? `Kreditnotaen gjelder varene over fra ordre #${order.number}. Beløpet er betalt tilbake med samme betalingsmåte som ved kjøpet.`
          : `Kreditnotaen opphever ${all.length > 1 ? "resten av " : ""}ordre #${order.number}. Beløpet er betalt tilbake eller ikke trukket, med samme betalingsmåte som ved kjøpet.`}
      </p>
    </main>
  );
}
