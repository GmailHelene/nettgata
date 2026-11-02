import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { runPendingExports } from "@/lib/eksport";
import { platformFetcher } from "@/lib/eksport/fetch";
import { getEmailProvider } from "@/lib/email/send";
import { getMediaStore } from "@/lib/storage";

/**
 * «Last ned alt» i bakgrunnen, hvert tiende minutt fra custom-worker.ts. Fortsetter ZIP-filer som ikke er ferdige,
 * og sletter filer som er eldre enn sju dager. Krever samme nøkkel som de andre bakgrunnsjobbene.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const result = await runPendingExports({ db: await getDb(), store: await getMediaStore(), fetchPath: platformFetcher(), email: getEmailProvider() });
  if (result.advanced || result.removed) console.log("Eksport", result);
  return Response.json(result);
}
