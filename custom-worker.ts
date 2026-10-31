// Inngangen Cloudflare kjører: OpenNext sin Worker for alle sidene, videresending fra plattformens
// ekstra adresser, og bakgrunnsjobben (cron) som sjekker kundedomener hvert tiende minutt.
// Se https://opennext.js.org/cloudflare/howtos/custom-worker
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore .open-next/worker.js lages av «opennextjs-cloudflare build»
import { default as handler } from "./.open-next/worker.js";
import { cronKey } from "./lib/cron";
import { platformRedirect } from "./lib/platform-redirect";

type Env = {
  WORKER_SELF_REFERENCE: { fetch(input: string, init?: RequestInit): Promise<Response> };
  SESSION_SECRET?: string;
  /** For eksempel «nettgata.com,www.nettgata.com,www.nettgata.no». */
  PLATFORM_ALIASES?: string;
  /** For eksempel «nettgata.no». */
  PLATFORM_CANONICAL_HOST?: string;
};
type Context = { waitUntil(promise: Promise<unknown>): void };

const worker = {
  fetch(request: Request, env: Env, ctx: Context) {
    const target = platformRedirect(request.url, env.PLATFORM_ALIASES, env.PLATFORM_CANONICAL_HOST);
    if (target) return Response.redirect(target, 301);
    return handler.fetch(request, env, ctx);
  },

  // Jobben kaller appen selv, så sjekken kjører med samme database og innstillinger som resten.
  async scheduled(_controller: unknown, env: Env, ctx: Context) {
    const secret = env.SESSION_SECRET?.trim();
    if (!secret) return;
    const key = await cronKey(secret);
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch("https://intern/api/cron/domener", { method: "POST", headers: { "x-cron-key": key } }).then(async (res) => {
        if (!res.ok) console.error("Domenesjekken feilet", res.status, await res.text());
      }),
    );
  },
};

export default worker;
