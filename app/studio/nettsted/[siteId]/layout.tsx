import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSuggestions, bookingServices, domains, inquiries, newsletters, newsletterSubscribers, orders } from "@/db/schema";
import { aiTeamActive } from "@/lib/ai/access";
import { requireSiteAccess } from "@/lib/session";
import { visibleNav, type NavBadgeKey } from "./nav-items";
import { StudioShell } from "./studio-shell";

/**
 * Felles ramme for alle sidene til ett nettsted. Tellerne og menyen hentes én gang her, ikke på hver side.
 * Tilgangen sjekkes også her, i tillegg til på hver side og i hver handling.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user } = await requireSiteAccess(siteId);
  const db = await getDb();
  const shop = site.kind === "nettbutikk";

  const [[{ unread }], [{ toShip }], [{ newIdeas }], [{ services }], [{ subscribers }], [{ letters }], domainRows] = await Promise.all([
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, site.id), isNull(inquiries.readAt))),
    shop
      ? db.select({ toShip: count() }).from(orders).where(and(eq(orders.siteId, site.id), eq(orders.status, "paid")))
      : Promise.resolve([{ toShip: 0 }]),
    db.select({ newIdeas: count() }).from(aiSuggestions).where(and(eq(aiSuggestions.siteId, site.id), eq(aiSuggestions.status, "ny"))),
    db.select({ services: count() }).from(bookingServices).where(eq(bookingServices.siteId, site.id)),
    db.select({ subscribers: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.siteId, site.id)),
    db.select({ letters: count() }).from(newsletters).where(eq(newsletters.siteId, site.id)),
    db.select({ hostname: domains.hostname, isPrimary: domains.isPrimary, status: domains.status }).from(domains).where(eq(domains.siteId, site.id)),
  ]);

  // En modul er i bruk når den har noe i seg. Til da ligger den under «Legg til funksjon».
  const modules = {
    booking: services > 0,
    nyhetsbrev: subscribers > 0 || letters > 0,
    "ai-teamet": aiTeamActive(site.billing) || newIdeas > 0,
  };
  const { groups, addable } = visibleNav({ shop, modules });

  const badges: Partial<Record<NavBadgeKey, string>> = {};
  if (toShip > 0) badges.ordre = `${toShip} å sende`;
  if (unread > 0) badges.henvendelser = `${unread} ${unread === 1 ? "ny" : "nye"}`;
  if (newIdeas > 0) badges["ai-teamet"] = `${newIdeas} forslag`;

  const primary = domainRows.find((d) => d.isPrimary && d.status === "active");
  const siteUrl = primary ? `https://${primary.hostname}` : `/vis/${site.slug}`;

  return (
    <StudioShell
      siteId={site.id}
      siteName={site.name}
      shop={shop}
      email={user.email}
      siteUrl={siteUrl}
      groups={groups}
      addable={addable}
      badges={badges}
    >
      {children}
    </StudioShell>
  );
}
