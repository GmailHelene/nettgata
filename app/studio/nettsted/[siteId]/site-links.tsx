import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";

/** Lenke til nettstedet og adressene det har, øverst på oversikten og sidelisten. */
export async function SiteLinks({ siteId, slug }: { siteId: string; slug: string }) {
  const domainRows = await (await getDb()).select().from(domains).where(eq(domains.siteId, siteId));
  const root = process.env.SITES_ROOT_DOMAIN ?? "localhost";
  const freeHost = root ? `${slug}.${root}` : null;
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return (
    <p className="mb-8 text-sm text-neutral-600">
      <a className="underline" href={`/vis/${slug}`} target="_blank" rel="noreferrer">
        Se nettstedet
      </a>
      {freeHost && (
        <>
          {" "}
          · Gratis adresse:{" "}
          <a className="underline" href={`${protocol}://${freeHost}`} target="_blank" rel="noreferrer">
            {freeHost}
          </a>
        </>
      )}
      {domainRows.map((d) => (
        <span key={d.id}>
          {" "}
          · {d.hostname} {d.status === "pending" ? "(venter på DNS)" : ""}
        </span>
      ))}
    </p>
  );
}
