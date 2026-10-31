import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { discountCodes } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { discountToInput } from "@/lib/shop/discounts";
import { SiteNav } from "../../site-nav";
import { DiscountForm } from "../discount-form";

export default async function EditDiscountPage({ params }: { params: Promise<{ siteId: string; discountId: string }> }) {
  const { siteId, discountId } = await params;
  const { site } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(discountId)) notFound();
  const [discount] = await (await getDb())
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.id, discountId), eq(discountCodes.siteId, site.id)))
    .limit(1);
  if (!discount) notFound();

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="rabatter" />
      <Link href={`/studio/nettsted/${site.id}/rabatter`} className="text-sm underline">
        Alle rabattkoder
      </Link>
      <section className="mt-4 rounded-lg border bg-white p-5">
        <h2 className="mb-1 text-lg font-semibold">Rediger {discount.code}</h2>
        <p className="mb-5 text-sm text-neutral-600">
          Brukt {discount.usedCount} {discount.usedCount === 1 ? "gang" : "ganger"}. Endringer gjelder nye kjøp. Ordre som allerede er lagt inn, beholder rabatten de fikk.
        </p>
        <DiscountForm siteId={site.id} discountId={discount.id} initial={discountToInput(discount)} />
      </section>
    </main>
  );
}
