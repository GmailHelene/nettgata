import { getDb } from "@/db";
import { unsubscribe } from "@/lib/nyhetsbrev/subscribers";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

/**
 * Ett-klikks avmelding (RFC 8058). E-postprogrammer som Gmail og Apple Mail viser «Meld av» ved siden av avsenderen,
 * og sender da en POST hit med nøkkelen fra List-Unsubscribe-hodet. Ingen innlogging og ingen side å trykke på.
 * GET gjør ingenting, så virusfiltre som åpner lenker ikke melder noen av.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const db = await getDb();
  if (!(await hit(db, `nyhetsbrev-lenke:${await clientKey(request.headers, getSecret())}`, rules.newsletterLinkPerIp))) {
    return new Response("For mange forsøk", { status: 429 });
  }
  const done = token ? await unsubscribe(db, token, null) : null;
  return new Response(done ? "Du er meldt av." : "Fant ikke påmeldingen.", {
    status: done ? 200 : 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
