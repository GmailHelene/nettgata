import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { inquiries } from "@/db/schema";
import { readAnswers } from "@/lib/content/form-fields";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { deleteInquiryAction, markInquiryReadAction } from "../../../site-actions";
import { SiteNav } from "../site-nav";

export default async function InquiriesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const rows = await db.select().from(inquiries).where(eq(inquiries.siteId, site.id)).orderBy(desc(inquiries.createdAt)).limit(100);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="henvendelser" />
      {rows.length === 0 ? (
        <p className="text-neutral-700">Ingen henvendelser ennå. Meldinger fra kontaktskjemaet havner her.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((q) => (
            <li key={q.id} className={`rounded-lg border bg-white p-5 ${q.readAt ? "" : "border-l-4 border-l-red-700"}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{q.name}</p>
                <p className="text-sm text-neutral-600">{q.createdAt.toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}</p>
              </div>
              <p className="mb-3 text-sm text-neutral-700">
                {q.email && (
                  <a className="mr-4 underline" href={`mailto:${q.email}`}>
                    {q.email}
                  </a>
                )}
                {q.phone && (
                  <a className="underline" href={`tel:${q.phone.replace(/\s/g, "")}`}>
                    {q.phone}
                  </a>
                )}
              </p>
              <p className="whitespace-pre-line">{q.message}</p>
              {readAnswers(q.answers).length > 0 && (
                <dl className="mt-3 grid gap-x-4 gap-y-1 border-t pt-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                  {readAnswers(q.answers).map((a, i) => (
                    <div key={i} className="contents">
                      <dt className="font-medium">{a.label}</dt>
                      <dd className="mb-2 whitespace-pre-line sm:mb-0">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="mt-3 flex gap-4">
                {!q.readAt && (
                  <form action={markInquiryReadAction.bind(null, site.id, q.id)}>
                    <button className="text-sm underline">Merk som lest</button>
                  </form>
                )}
                <form action={deleteInquiryAction.bind(null, site.id, q.id)}>
                  <button className="text-sm text-red-800 underline">Slett</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-neutral-600">
        Henvendelser er personopplysninger. Slett dem når saken er ferdig, og senest etter 12 måneder.{" "}
        <HelpLink slug="skjemafelt">Slik spør du om mer i skjemaet</HelpLink>
      </p>
    </main>
  );
}
