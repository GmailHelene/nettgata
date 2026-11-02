import { getDb } from "@/db";
import { validateKustom } from "@/lib/payments/service";

const plain = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };

/**
 * Validering fra Kustom (merchant_urls.validation) rett før kjøpet fullføres. 200 godtar kjøpet. 303 til kvitteringen
 * stopper det, for eksempel når ordren er kansellert mens kassen sto åpen. Kustom venter i ti sekunder, og med
 * require_validate_callback_success stoppes kjøpet hvis vi ikke svarer.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => null);
  const db = await getDb();
  const origin = `https://${request.headers.get("host") ?? url.host}`;
  const result = await validateKustom(db, { orderId: url.searchParams.get("ordre") ?? "", token: url.searchParams.get("t") ?? "", origin, body });
  if (result.ok) return new Response(null, { status: 200, headers: plain });
  if (!result.location) return new Response("Fant ikke ordren", { status: 404, headers: plain });
  return new Response(null, { status: 303, headers: { ...plain, Location: result.location } });
}
