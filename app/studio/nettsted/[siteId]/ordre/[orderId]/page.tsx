import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, orderLines, orders, productVariants, products } from "@/db/schema";
import { bringBookingView, readOrderBring, type OrderBring } from "@/lib/bring/booking";
import { bringSetupView } from "@/lib/bring/config";
import { bringProductIds, bringProducts } from "@/lib/bring/products";
import { cartWeight, formatWeight } from "@/lib/bring/weight";
import { requireSiteAccess } from "@/lib/session";
import { creditNotesForOrder, creditReasonLabel, needsCreditNote, PARTIAL_REASON } from "@/lib/shop/credit-notes";
import { allocateDiscount } from "@/lib/shop/discounts";
import { refundable, refundsForOrder } from "@/lib/shop/refunds";
import { formatNok } from "@/lib/shop/money";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { carrierLabel, trackingUrl } from "@/lib/shop/tracking";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { orderStatusLabel } from "../order-status";
import { LabelPrintHelp } from "@/components/studio/label-print-help";
import { BringLabelForm } from "./bring-label";
import { OrderActions } from "./order-actions";
import { RefundForm } from "./refund-form";
import { CreditNoteRetry, StaffNoteForm, TrackingForm } from "./order-extras";

export const metadata: Metadata = { title: "Ordre" };

/** Hvor fraktprisen i kassen kom fra, sagt så butikkeieren forstår det. */
function bringPriceNote(b: OrderBring): string {
  const product = bringProducts[b.product].name;
  if (b.price === "bring") return `Kunden valgte ${product}. Fraktprisen kom fra Bring.`;
  if (b.price === "gratis") return `Kunden valgte ${product}, med gratis frakt etter reglene dine.`;
  return b.reason === "vekt"
    ? `Kunden valgte ${product}. Reserveprisen ble brukt, fordi minst én vare mangler vekt.`
    : `Kunden valgte ${product}. Reserveprisen ble brukt, fordi Bring ikke ga pris akkurat da.`;
}

const emailKindLabel: Record<string, string> = {
  ordrebekreftelse: "Ordrebekreftelse",
  "ny-ordre": "Varsel til deg om ny ordre",
  sendt: "«Pakken er på vei»",
  refusjon: "«Du får penger tilbake»",
};
const emailStatusLabel: Record<string, string> = {
  sendt: "Sendt",
  feilet: "Feilet",
  logget: "Ikke sendt, e-post er ikke slått på ennå",
};

export default async function OrderPage({ params }: { params: Promise<{ siteId: string; orderId: string }> }) {
  const { siteId, orderId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) notFound();
  const [lines, emails, notes, refunds] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.name), asc(orderLines.id)),
    db.select().from(emailLog).where(eq(emailLog.orderId, order.id)).orderBy(asc(emailLog.createdAt)),
    creditNotesForOrder(db, site.id, order.id),
    refundsForOrder(db, order.id),
  ]);
  const creditNote = notes.find((n) => n.reason !== PARTIAL_REASON) ?? null;
  // Delvis refusjon: bare for ordre som er sendt eller hentet, og bare for eieren (som full refusjon).
  const left = refundable(order, lines, refunds.filter((r) => r.status === "ferdig"));
  const shares = allocateDiscount(lines.map((l) => l.totalOre), order.discountOre);
  const pendingRefund = refunds.find((r) => r.status === "behandles") ?? null;
  const online = order.paymentMethod === "vipps" || order.paymentMethod === "klarna" || order.paymentMethod === "kustom" || order.paymentMethod === "stripe";
  const status = orderStatusLabel[order.status];

  // Frakt med Bring: hva kunden valgte i kassen, og etiketten hvis den er laget.
  const orderBring = readOrderBring(order.shipping);
  const booking = bringBookingView(order.shipping);
  const bringSetup = bringSetupView(site.shop);
  const bringReady = Boolean(bringSetup.account?.ready && bringSetup.shipping);
  const showBring = site.kind === "nettbutikk" && order.shippingAddress !== null && Boolean(orderBring || booking || bringSetup.account);
  let estimatedGrams = orderBring?.weightGrams ?? null;
  if (showBring && !booking && estimatedGrams === null) {
    // Ordre med et fast fraktvalg har ingen vekt fra kassen. Da brukes vekten varene har nå.
    const ids = lines.map((l) => l.variantId).filter((id): id is string => Boolean(id));
    const weights = ids.length
      ? await db
          .select({ id: productVariants.id, own: productVariants.weightGrams, product: products.weightGrams })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(and(inArray(productVariants.id, ids), eq(products.siteId, site.id)))
      : [];
    const byId = new Map(weights.map((w) => [w.id, w.own ?? w.product]));
    estimatedGrams = cartWeight(lines.map((l) => ({ quantity: l.quantity, weightGrams: l.variantId ? (byId.get(l.variantId) ?? null) : null })));
  }
  const enabledProducts = bringSetup.shipping?.products.map((p) => p.id) ?? [];
  const labelProducts = [...enabledProducts, ...bringProductIds.filter((id) => !enabledProducts.includes(id))].map((id) => ({ id, name: bringProducts[id].name }));

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href={`/studio/nettsted/${site.id}/ordre`} className="text-sm underline">
        Alle ordre
      </Link>
      <div className="mb-8 mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Ordre #{order.number}</h1>
        <span className={`rounded-full px-3 py-1 text-sm ${status.className}`}>{status.text}</span>
        <a
          href={`/studio/nettsted/${site.id}/ordre/${order.id}/pakkseddel`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold"
        >
          Pakkseddel
        </a>
      </div>

      <OrderActions
        siteId={site.id}
        orderId={order.id}
        status={order.status}
        online={online}
        owner={role === "owner"}
      />
      {order.status === "fulfilled" && role === "owner" && (
        <RefundForm
          siteId={site.id}
          orderId={order.id}
          online={online}
          paymentLabel={paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
          shippingLeftOre={left.shippingOre}
          pending={pendingRefund && { id: pendingRefund.id, error: pendingRefund.error, lines: pendingRefund.lines, shippingOre: pendingRefund.shippingOre, reason: pendingRefund.reason }}
          lines={lines.map((l, i) => ({
            id: l.id,
            name: l.name,
            variantLabel: l.variantLabel,
            remaining: Math.max(left.quantities.get(l.id) ?? 0, 0),
            quantity: l.quantity,
            unitPriceOre: l.unitPriceOre,
            discountShareOre: shares[i],
          }))}
        />
      )}

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
          {order.discountOre > 0 && (
            <div className="flex justify-between">
              <dt>Rabatt ({order.discountCode})</dt>
              <dd>−{formatNok(order.discountOre)}</dd>
            </div>
          )}
          {order.discountCode && order.discountOre === 0 && (
            <div className="flex justify-between">
              <dt>Rabattkode</dt>
              <dd>{order.discountCode} (fri frakt)</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Levering: {order.shipping.name}</dt>
            <dd>{formatNok(order.shippingOre)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Totalt</dt>
            <dd>{formatNok(order.totalOre)}</dd>
          </div>
          {order.vatOre > 0 && (
            <div className="flex justify-between text-neutral-600">
              <dt>Herav MVA</dt>
              <dd>{formatNok(order.vatOre)}</dd>
            </div>
          )}
        </dl>
      </section>

      {order.refundedOre > 0 && (
        <p className="mt-3 text-sm text-neutral-700">
          Refundert så langt: <strong>{formatNok(order.refundedOre)}</strong> av {formatNok(order.totalOre)}.
        </p>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="kreditnota" className="mt-6 rounded-lg border bg-white p-5">
          <h2 id="kreditnota" className="font-semibold">
            {notes.length === 1 ? `Kreditnota nr. ${notes[0].number}` : "Kreditnotaer"}
          </h2>
          <p className="text-sm text-neutral-600">En kreditnota kan ikke endres.</p>
          <ul className="mt-3 divide-y text-sm">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {notes.length > 1 && <strong className="mr-2">Nr. {n.number}</strong>}
                  {creditReasonLabel[n.reason] ?? n.reason}. Laget {formatOsloDateTime(n.createdAt)}, {formatNok(n.totalOre)}.
                </span>
                <a
                  href={`/studio/nettsted/${site.id}/ordre/${order.id}/kreditnota?nr=${n.number}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-[#173b6c] px-4 py-2 font-semibold"
                >
                  Vis og skriv ut<span className="sr-only"> kreditnota {n.number}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!creditNote && needsCreditNote(order) && (
        <section aria-labelledby="kreditnota-mangler" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 id="kreditnota-mangler" className="font-semibold">
            Kreditnotaen mangler
          </h2>
          <p className="mb-3 mt-1 text-sm text-neutral-800">
            Ordren ble betalt og så {order.status === "cancelled" ? "kansellert" : "refundert"}, men kreditnotaen ble ikke laget. Regnskapet trenger den.
          </p>
          {role === "owner" || role === "editor" ? (
            <CreditNoteRetry siteId={site.id} orderId={order.id} />
          ) : (
            <p className="text-sm text-neutral-800">Eieren eller en redaktør kan lage den.</p>
          )}
        </section>
      )}

      <section className="mt-6 grid gap-6 rounded-lg border bg-white p-5 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Kunde</h2>
          <p>
            {order.customerId ? (
              <Link href={`/studio/nettsted/${site.id}/kunder/${order.customerId}`} className="underline">
                {order.customerName}
              </Link>
            ) : (
              order.customerName
            )}
          </p>
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
          <p className="mt-2 text-sm text-neutral-600">
            Betaling: {paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
            {/^(vipps|klarna|kustom|stripe):test:/.test(order.paymentRef ?? "") && " (testmiljø, ingen ekte penger)"}
          </p>
        </div>
        {order.note && (
          <div className="sm:col-span-2">
            <h2 className="mb-2 font-semibold">Melding fra kunden</h2>
            <p className="whitespace-pre-line">{order.note}</p>
          </div>
        )}
      </section>

      {showBring && (
        <section className="mt-6 rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-semibold">Frakt med Bring</h2>
          {orderBring && <p className="mb-3 text-sm text-neutral-700">{bringPriceNote(orderBring)}</p>}
          {booking ? (
            <div className="space-y-3 text-sm">
              <p>
                Etiketten ble laget {formatOsloDateTime(new Date(booking.bookedAt))}
                {booking.test ? " som testbestilling. Bring henter ikke pakken og sender ingen faktura." : "."}
              </p>
              <p>
                {bringProducts[booking.product].name}, {formatWeight(booking.weightGrams)}. Sendingsnummer {booking.consignmentNumber}.
              </p>
              {booking.hasLabel ? (
                <a
                  href={`/studio/nettsted/${site.id}/ordre/${order.id}/etikett`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-md border border-[#173b6c] px-4 py-2 font-semibold"
                >
                  Last ned etiketten (PDF)
                </a>
              ) : (
                <p>Bring sendte ingen etikett hit. Du finner den i Mybring.</p>
              )}
              {booking.hasLabel && <LabelPrintHelp />}
            </div>
          ) : !bringReady ? (
            <p className="text-sm text-neutral-700">
              Koble til Bring under{" "}
              <Link href={`/studio/nettsted/${site.id}/innstillinger/frakt`} className="underline">
                Frakt med Bring
              </Link>{" "}
              for å lage fraktetiketten herfra.
            </p>
          ) : order.status === "paid" || order.status === "fulfilled" ? (
            <BringLabelForm
              siteId={site.id}
              orderId={order.id}
              products={labelProducts}
              defaultProduct={orderBring?.product ?? labelProducts[0].id}
              defaultWeightGrams={estimatedGrams}
              test={bringSetup.account?.environment === "test"}
            />
          ) : (
            <p className="text-sm text-neutral-700">
              {order.status === "pending_payment" ? "Du kan lage fraktetiketten når ordren er betalt." : "Ordren er kansellert eller refundert, så den skal ikke sendes."}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-600">Bring fakturerer sendingene til deg etter din egen avtale. Nettgata tar aldri betalt for frakt.</p>
        </section>
      )}

      {/* Sporing gir bare mening når pakken sendes. «Hent selv» har ingen adresse. */}
      {order.shippingAddress && order.status !== "cancelled" && order.status !== "pending_payment" && (
        <section className="mt-6 rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-semibold">Sporing</h2>
          {order.trackingNumber && (
            <p className="mb-3 text-sm">
              {carrierLabel(order.trackingCarrier)}: {order.trackingNumber}
              {trackingUrl(order.trackingCarrier, order.trackingNumber) && (
                <>
                  {" "}
                  <a href={trackingUrl(order.trackingCarrier, order.trackingNumber)!} target="_blank" rel="noreferrer" className="underline">
                    Åpne sporing
                  </a>
                </>
              )}
            </p>
          )}
          <TrackingForm siteId={site.id} orderId={order.id} status={order.status} carrier={order.trackingCarrier} number={order.trackingNumber} />
        </section>
      )}

      {emails.length > 0 && (
        <section className="mt-6 rounded-lg border bg-white p-5">
          <h2 className="mb-3 font-semibold">E-post</h2>
          <ul className="space-y-2 text-sm">
            {emails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{emailKindLabel[e.kind] ?? e.kind}</span>
                <span className="text-neutral-600">
                  til {e.recipient} · {formatOsloDateTime(e.createdAt)}
                </span>
                <span className={e.status === "sendt" ? "text-green-800" : e.status === "feilet" ? "text-red-800" : "text-amber-900"}>
                  {emailStatusLabel[e.status] ?? e.status}
                  {e.error && `: ${e.error}`}
                </span>
                {process.env.NODE_ENV !== "production" && (
                  <a href={`/studio/epost/${e.id}`} target="_blank" rel="noreferrer" className="underline">
                    Forhåndsvis
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-lg border bg-white p-5">
        <h2 className="mb-1 font-semibold">Internt notat</h2>
        <p className="mb-3 text-sm text-neutral-600">Bare for deg og de som jobber i butikken. Kunden ser det aldri.</p>
        <StaffNoteForm siteId={site.id} orderId={order.id} note={order.staffNote} />
      </section>

      <p className="mt-6 text-sm text-neutral-600">
        Bestilt {formatOsloDateTime(order.createdAt)}
        {order.paidAt && ` · betalt ${formatOsloDateTime(order.paidAt)}`}
        {order.fulfilledAt && ` · sendt ${formatOsloDateTime(order.fulfilledAt)}`}
        {order.cancelledAt && ` · kansellert ${formatOsloDateTime(order.cancelledAt)}`}
      </p>
    </main>
  );
}
