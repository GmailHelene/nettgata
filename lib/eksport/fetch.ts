import { getCloudflareContext } from "@opennextjs/cloudflare";
import { platformUrl } from "@/lib/site-url";

type ServiceBinding = { fetch(input: string, init?: RequestInit): Promise<Response> };

/**
 * Henter sider og filer fra plattformen selv, til den statiske kopien i eksporten.
 * I Cloudflare går kallet gjennom WORKER_SELF_REFERENCE (samme binding som bakgrunnsjobbene bruker), med plattformens
 * adresse som vertsnavn, så /vis/<slug> virker. Svarer ikke bindingen, prøves vanlig fetch mot adressen.
 * Lokalt går alt til utviklingsserveren.
 */
export function platformFetcher(): (path: string) => Promise<Response> {
  const base = platformUrl();
  let binding: ServiceBinding | undefined;
  if (process.env.NODE_ENV === "production") {
    try {
      binding = (getCloudflareContext().env as unknown as { WORKER_SELF_REFERENCE?: ServiceBinding }).WORKER_SELF_REFERENCE;
    } catch {
      binding = undefined;
    }
  }
  return async (path) => {
    const url = `${base}${path}`;
    const init: RequestInit = { headers: { "user-agent": "Nettgata-eksport" }, redirect: "follow" };
    if (binding) {
      const res = await binding.fetch(url, init).catch(() => null);
      if (res?.ok) return res;
    }
    return fetch(url, init);
  };
}
