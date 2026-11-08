import type { Metadata } from "next";
import { ui } from "@/components/studio/ui";
import { PageIntro } from "@/components/studio/help";
import { getDb } from "@/db";
import { getEmailProvider } from "@/lib/email/send";
import { canSendNewsletter, deliveryProgress, latestDraft, newsletterHistory, newsletterSite } from "@/lib/nyhetsbrev/send";
import { subscriberCounts } from "@/lib/nyhetsbrev/subscribers";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { NewsletterComposer } from "./composer";
import { NewsletterTabs } from "./newsletter-tabs";

export const metadata: Metadata = { title: "Nyhetsbrev" };

export default async function NewsletterPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [counts, draft, history, emailSite] = await Promise.all([
    subscriberCounts(db, site.id),
    latestDraft(db, site.id),
    newsletterHistory(db, site.id),
    newsletterSite(db, site),
  ]);
  // Fremdriften vises bare for nyhetsbrev som er på vei ut. De ferdige har tallene lagret.
  const progress = new Map(
    await Promise.all(history.filter((h) => h.status === "sender").map(async (h) => [h.id, await deliveryProgress(db, h.id)] as const)),
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="nyhetsbrev" />
      <NewsletterTabs siteId={site.id} active="skriv" counts={counts} />
      <PageIntro article="nyhetsbrev">Bare de som har bekreftet påmeldingen, får nyhetsbrevet. Send en testutgave til deg selv før du sender.</PageIntro>

      <NewsletterComposer
        siteId={site.id}
        site={emailSite}
        draft={draft}
        recipients={counts.bekreftet}
        canSend={canSendNewsletter(role)}
        emailOn={getEmailProvider().name !== "logg"}
      />

      <section aria-labelledby="sendte" className="mt-12">
        <h2 id="sendte" className="mb-3 text-xl font-semibold">
          Sendte nyhetsbrev
        </h2>
        {history.length === 0 ? (
          <p className={ui.muted}>Ingen nyhetsbrev er sendt ennå.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-[#d5dbe0]">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Emne
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Sendt
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right">
                    Mottakere
                  </th>
                  <th scope="col" className="py-2">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6eaed]">
                {history.map((h) => {
                  const p = progress.get(h.id);
                  const done = p ? (p.sendt ?? 0) + (p.logget ?? 0) + (p.feilet ?? 0) + (p.hoppet ?? 0) : 0;
                  return (
                    <tr key={h.id}>
                      <td className="py-2 pr-4 font-medium">{h.subject}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{h.queuedAt ? formatOsloDateTime(h.queuedAt) : ""}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.recipientCount}</td>
                      <td className="py-2">
                        {h.status === "sender"
                          ? `Sender, ${done} av ${h.recipientCount} ferdig`
                          : `Sendt til ${h.sentCount}${h.failedCount ? `, ${h.failedCount} feilet` : ""}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
