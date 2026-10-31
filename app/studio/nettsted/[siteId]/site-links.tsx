import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { displayHost, rootOf } from "@/lib/domains";

/** Lenke til nettstedet og adressene det har, øverst på oversikten og sidelisten. */
export async function SiteLinks({ siteId, slug }: { siteId: string; slug: string }) {
  const domainRows = await (await getDb()).select().from(domains).where(eq(domains.siteId, siteId));
  const primary = domainRows.find((d) => d.isPrimary && d.status === "active");
  const pendingRoots = [...new Set(domainRows.filter((d) => d.status === "pending" && d.kind !== "apex").map(rootOf))];
  const root = process.env.SITES_ROOT_DOMAIN ?? "localhost";
  const freeHost = root ? `${slug}.${root}` : null;
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <p className="mb-8 text-sm text-neutral-600">
      {primary ? (
        <a className="font-medium text-neutral-900 underline" href={`https://${primary.hostname}`} target="_blank" rel="noreferrer">
          {displayHost(primary.hostname)}
        </a>
      ) : (
        <a className="underline" href={`/vis/${slug}`} target="_blank" rel="noreferrer">
          Se nettstedet
        </a>
      )}
      {freeHost && !primary && (
        <>
          {" "}
          · Gratis adresse:{" "}
          <a className="underline" href={`${protocol}://${freeHost}`} target="_blank" rel="noreferrer">
            {freeHost}
          </a>
        </>
      )}
      {pendingRoots.map((r) => (
        <span key={r}> · {displayHost(r)} venter på DNS</span>
      ))}{" "}
      ·{" "}
      <Link href={`/studio/nettsted/${siteId}/domene`} className="underline">
        {primary || pendingRoots.length ? "Domene" : "Koble til eget domene"}
      </Link>
    </p>
  );
}
