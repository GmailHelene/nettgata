import { getDb } from "@/db";
import { fikenCallback } from "@/lib/fiken/connect";
import { checkSiteAccess, getCurrentUser } from "@/lib/session";

/**
 * Fiken sender eieren hit etter «Koble til Fiken» (redirect URL registrert hos Fiken: https://nettgata.no/studio/fiken/callback).
 * Koden byttes mot nøkler på serveren, og eieren sendes videre til Betaling med en kort kode for resultatet.
 * Koden fra Fiken og state blir aldri med videre i adressen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  if (!user) return redirect(request, "/studio/logg-inn");
  const db = await getDb();
  const { siteId, result } = await fikenCallback(
    db,
    { code: url.searchParams.get("code"), state: url.searchParams.get("state"), error: url.searchParams.get("error") },
    user,
    async (id) => {
      const access = await checkSiteAccess(id);
      return access?.role === "owner" && access.site.kind === "nettbutikk";
    },
  );
  return redirect(request, siteId ? `/studio/nettsted/${siteId}/innstillinger/regnskap?fiken=${result}#fiken-tittel` : `/studio?fiken=${result}`);
}

function redirect(request: Request, path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: new URL(path, request.url).toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
