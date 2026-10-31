// Inngangen Cloudflare kjører: OpenNext sin Worker for alle sidene, pluss bakgrunnsjobben (cron)
// som sjekker kundedomener hvert tiende minutt. Se https://opennext.js.org/cloudflare/howtos/custom-worker
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore .open-next/worker.js lages av «opennextjs-cloudflare build»
import { default as handler } from "./.open-next/worker.js";
import { cronKey } from "./lib/cron";

type Env = {
  WORKER_SELF_REFERENCE: { fetch(input: string, init?: RequestInit): Promise<Response> };
  SESSION_SECRET?: string;
};
type Context = { waitUntil(promise: Promise<unknown>): void };

const worker = {
  fetch: handler.fetch,

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
