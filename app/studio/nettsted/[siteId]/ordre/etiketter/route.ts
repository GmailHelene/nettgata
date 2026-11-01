import { getDb } from "@/db";
import { collectLabels, parseOrderIds } from "@/lib/bring/bulk";
import { mergePdfs } from "@/lib/bring/merge";
import { checkSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";

const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } as const;
const plain = (text: string, status: number) => new Response(text, { status, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } });

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Alle valgte fraktetiketter som én PDF, én etikett per side. Krever innlogging med tilgang til butikken, som etikett/route.ts:
 * etikettene har kundenes navn og adresser. Feiler sammenslåingen eller kan en etikett ikke hentes, får brukeren en side med
 * lenker til de enkelte etikettene i stedet, så ingen etikett forsvinner stille.
 */
export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403, headers: noStore });

  let ids: string[];
  try {
    ids = parseOrderIds((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean));
  } catch (err) {
    if (err instanceof ShopError) return plain(err.message, 400);
    throw err;
  }

  const { labels, missing } = await collectLabels(await getDb(), access.site.id, ids);
  if (labels.length === 0) return plain("Fant ingen etiketter blant de valgte ordrene.", 404);

  let mergeFailed = false;
  if (missing.length === 0) {
    try {
      const pdf = await mergePdfs(labels.map((l) => l.bytes));
      return new Response(pdf as BodyInit, {
        headers: { ...noStore, "content-type": "application/pdf", "content-disposition": 'inline; filename="fraktetiketter-samlet.pdf"' },
      });
    } catch (err) {
      mergeFailed = true;
      console.error("Sammenslåing av fraktetiketter feilet", err instanceof Error ? err.name : "ukjent feil");
    }
  }

  const base = `/studio/nettsted/${access.site.id}/ordre`;
  const rows = [
    ...labels.map((l) => ({ number: l.number, orderId: l.orderId, reason: null as string | null })),
    ...missing.map((m) => ({ number: m.number, orderId: m.orderId, reason: m.reason })),
  ];
  const items = rows
    .map((r) =>
      r.reason
        ? `<li>Ordre ${r.number === null ? "ukjent" : `#${r.number}`}: ${escapeHtml(r.reason)}</li>`
        : `<li><a href="${base}/${r.orderId}/etikett" target="_blank" rel="noopener">Åpne etiketten for ordre #${r.number} (åpnes i ny fane)</a></li>`,
    )
    .join("");
  const why = mergeFailed
    ? "Etikettene kunne ikke slås sammen til én PDF, kanskje fordi formatet fra Bring ikke lot seg lese. Åpne dem én og én."
    : "Noen av etikettene kunne ikke hentes, så det ble ingen samlet PDF. Åpne de som er klare én og én.";
  const html = `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fraktetiketter</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1b232b;line-height:1.5}li{margin:.5rem 0}a{color:#173b6c}</style></head>
<body><main><h1>Fraktetiketter</h1><p>${why}</p><ul>${items}</ul></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { ...noStore, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
