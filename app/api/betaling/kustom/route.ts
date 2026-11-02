import { getDb } from "@/db";
import { kustomCheckoutPage } from "@/lib/payments/service";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Siden med Kustom-kassen (merchant_urls.checkout). En enkel HTML-side i stedet for en React-side, fordi skriptet i
 * html_snippet da kjører som det er, uten å måtte lages på nytt i nettleseren. Snutten hentes fersk fra Kustom hver
 * gang og lagres aldri. Er ordren betalt, kansellert eller fullført hos Kustom, sendes kunden til kvitteringen.
 *
 * Butikksidene har ingen Content-Security-Policy i dag. Får de det, må denne siden tillate *.kustom.co i script-src og frame-src.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await getDb();
  const page = await kustomCheckoutPage(db, {
    orderId: url.searchParams.get("ordre") ?? "",
    token: url.searchParams.get("t") ?? "",
    host: request.headers.get("host") ?? url.host,
  });
  if (!page) return new Response("Fant ikke bestillingen.", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  if (page.kind === "redirect") return new Response(null, { status: 303, headers: { ...noStore, Location: page.location } });

  const name = escape(page.siteName);
  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Betaling - ${name}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  .avbryt { margin-top: 24px; }
  .avbryt button { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: #1a1a1a; text-decoration: underline; cursor: pointer; }
  .avbryt button:focus-visible { outline: 3px solid #1a1a1a; outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1>Betaling hos ${name}</h1>
<p>Fullfør betalingen i Kustom-kassen under. Bestillingen er ikke betalt før Kustom har bekreftet betalingen.</p>
<div id="kustom-kasse">${page.snippet}</div>
<form class="avbryt" method="post" action="/api/betaling/avbryt">
<input type="hidden" name="ordre" value="${escape(page.orderId)}">
<input type="hidden" name="t" value="${escape(page.token)}">
<button type="submit">Avbryt og velg en annen betalingsmåte</button>
</form>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { ...noStore, "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY", "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
  });
}
