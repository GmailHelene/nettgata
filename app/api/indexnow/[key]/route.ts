import { getDb } from "@/db";
import { isPlatformHost, normalizeHost, resolveHost } from "@/lib/hosts";
import { indexNowKey } from "@/lib/seo/indexnow";

/**
 * Nøkkelfilen for IndexNow, https://<domene>/<nøkkel>.txt (omskrevet hit i next.config.ts).
 * Søkemotoren henter den for å se at pingen kom fra den som eier domenet. Bare riktig nøkkel for riktig domene svarer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const host = normalizeHost(request.headers.get("host"));
  if (!host || isPlatformHost(host)) return new Response("Not found", { status: 404 });
  const match = await resolveHost(await getDb(), host);
  if (!match || key !== (await indexNowKey(host))) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
