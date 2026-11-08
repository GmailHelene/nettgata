import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { inquiries } from "@/db/schema";
import { readAnswers } from "@/lib/content/form-fields";
import { canViewInquiryImages, imagesFor, inquiryImageSrc } from "@/lib/henvendelser/bilder";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { deleteInquiryAction, markInquiryReadAction } from "../../../site-actions";
import { ConfirmButton } from "@/components/studio/confirm-button";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = { title: "Henvendelser" };

export default async function InquiriesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  const db = await getDb();
  const rows = await db.select().from(inquiries).where(eq(inquiries.siteId, site.id)).orderBy(desc(inquiries.createdAt)).limit(100);
  const images = await imagesFor(
    db,
    site.id,
    rows.map((q) => q.id),
  );
  const showImages = canViewInquiryImages(role);

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
              {(images.get(q.id)?.length ?? 0) > 0 &&
                (showImages ? (
                  <ul className="mt-3 flex flex-wrap gap-3 border-t pt-3" aria-label={`Bilder fra ${q.name}`}>
                    {images.get(q.id)!.map((imageId, i, all) => (
                      <li key={imageId}>
                        {/* Åpner bildet i full størrelse. Ruten sjekker tilgangen og lagres ikke i noen cache. */}
                        <a href={inquiryImageSrc(imageId)} className="block rounded outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-700">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={inquiryImageSrc(imageId)}
                            alt={all.length > 1 ? `Bilde fra ${q.name}, ${i + 1} av ${all.length}` : `Bilde fra ${q.name}`}
                            loading="lazy"
                            className="size-28 rounded border object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t pt-3 text-sm text-neutral-700">
                    {images.get(q.id)!.length} {images.get(q.id)!.length === 1 ? "bilde" : "bilder"} lagt ved. Bare eier og redaktør kan se bildene.
                  </p>
                ))}
              <div className="mt-3 flex gap-4">
                {!q.readAt && (
                  <form action={markInquiryReadAction.bind(null, site.id, q.id)}>
                    <button className="text-sm underline">Merk som lest</button>
                  </form>
                )}
                <form action={deleteInquiryAction.bind(null, site.id, q.id)}>
                  <ConfirmButton
                    className="ml-auto min-h-6 text-sm text-red-800 underline"
                    label={`Slett henvendelsen fra ${q.name || q.email}`}
                    question={`Slette henvendelsen fra ${q.name || q.email}? Den kan ikke hentes tilbake.`}
                  >
                    Slett
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-neutral-600">
        Henvendelser er personopplysninger. Slett dem når saken er ferdig, og senest etter 12 måneder. Bilder som er lagt ved, slettes
        sammen med henvendelsen.{" "}
        <HelpLink slug="skjemafelt">Slik spør du om mer i skjemaet</HelpLink>
      </p>
    </main>
  );
}
