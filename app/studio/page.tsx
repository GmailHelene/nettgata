import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, sites } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { requireUser } from "@/lib/session";
import { logout } from "./actions";

export default async function StudioHome() {
  const user = await requireUser();
  const db = await getDb();
  const rows = user.isPlatformAdmin
    ? await db.select().from(sites).orderBy(asc(sites.name))
    : (
        await db
          .select({ site: sites })
          .from(memberships)
          .innerJoin(sites, eq(memberships.orgId, sites.orgId))
          .where(eq(memberships.userId, user.id))
          .orderBy(asc(sites.name))
      ).map((r) => r.site);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dine nettsteder</h1>
        {user.isPlatformAdmin && (
          <Link href="/studio/nytt" className="ml-auto mr-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
            Nytt nettsted
          </Link>
        )}
        <Link href="/studio/konto" className={`text-sm underline ${user.isPlatformAdmin ? "mr-4" : "ml-auto mr-4"}`}>
          Konto
        </Link>
        <form action={logout}>
          <button className="text-sm underline">Logg ut ({user.email})</button>
        </form>
      </header>
      {rows.length === 0 ? (
        <p>Du har ingen nettsteder ennå.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((site) => (
            <li key={site.id}>
              <Link href={`/studio/nettsted/${site.id}`} className="block rounded-lg border bg-white p-5 hover:border-neutral-900">
                <span className="block font-semibold">{site.name}</span>
                <span className="text-sm text-neutral-600">
                  {site.kind === "nettbutikk" ? "Nettbutikk" : "Nettside"} · {getPack(site.industryPack)?.label ?? site.industryPack}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
