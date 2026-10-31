import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { getCustomer } from "@/lib/shop/customers";
import { formatNok } from "@/lib/shop/money";
import { orderStatusLabel } from "../../ordre/order-status";
import { SiteNav } from "../../site-nav";
import { CustomerNote } from "./customer-note";

export default async function CustomerPage({ params }: { params: Promise<{ siteId: string; customerId: string }> }) {
  const { siteId, customerId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const data = await getCustomer(await getDb(), site.id, customerId);
  if (!data) notFound();
  const { customer } = data;
  const lastAddress = data.orders.find((o) => o.shippingAddress)?.shippingAddress;

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="kunder" />
      <Link href={`/studio/nettsted/${site.id}/kunder`} className="text-sm underline">
        Alle kunder
      </Link>
      <h2 className="mb-6 mt-4 text-xl font-bold">{customer.name}</h2>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-neutral-600">Handlet for</p>
          <p className="mt-1 text-2xl font-semibold">{formatNok(data.spentOre)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-neutral-600">Ordre</p>
          <p className="mt-1 text-2xl font-semibold">{data.orderCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-neutral-600">Snitt per ordre</p>
          <p className="mt-1 text-2xl font-semibold">{formatNok(data.averageOre)}</p>
        </div>
      </div>

      <section className="mb-6 grid gap-6 rounded-lg border bg-white p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">Kontakt</h3>
          <p>
            <a className="underline" href={`mailto:${customer.email}`}>
              {customer.email}
            </a>
          </p>
          {customer.phone && (
            <p>
              <a className="underline" href={`tel:${customer.phone.replace(/\s/g, "")}`}>
                {customer.phone}
              </a>
            </p>
          )}
          <p className="mt-2 text-sm text-neutral-600">
            Kunde siden {formatOsloDateTime(customer.createdAt)}
            {data.lastOrderAt && ` · sist handlet ${formatOsloDateTime(data.lastOrderAt)}`}
          </p>
        </div>
        {lastAddress && (
          <div>
            <h3 className="mb-2 font-semibold">Siste leveringsadresse</h3>
            <address className="not-italic">
              {lastAddress.street}
              <br />
              {lastAddress.postalCode} {lastAddress.city}
            </address>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border bg-white p-5">
        <h3 className="mb-3 font-semibold">Ordre</h3>
        <ul className="divide-y text-sm">
          {data.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/studio/nettsted/${site.id}/ordre/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:underline">
                <span className="w-14 font-semibold">#{o.number}</span>
                <span className="mr-auto text-neutral-600">{formatOsloDateTime(o.createdAt)}</span>
                <span className="tabular-nums">{formatNok(o.totalOre)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${orderStatusLabel[o.status].className}`}>{orderStatusLabel[o.status].text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h3 className="mb-1 font-semibold">Notat om kunden</h3>
        <p className="mb-3 text-sm text-neutral-600">Bare for deg og de som jobber i butikken. Kunden ser det aldri.</p>
        <CustomerNote siteId={site.id} customerId={customer.id} note={customer.note} />
      </section>
    </main>
  );
}
