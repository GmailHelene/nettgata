"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { exportRule, runExportStep, startExport } from "@/lib/eksport";
import { platformFetcher } from "@/lib/eksport/fetch";
import { getEmailProvider } from "@/lib/email/send";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { getMediaStore } from "@/lib/storage";
import type { ActionState } from "@/app/studio/actions";

/**
 * «Last ned alt». Bare eieren, fordi filen har alle personopplysningene til nettstedet.
 * Første del lages rett etter svaret (after), resten tar bakgrunnsjobben.
 */
export async function requestExportAction(siteId: string): Promise<ActionState> {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (role !== "owner") return { ok: false, message: "Bare eieren av nettstedet kan laste ned alt." };
  const db = await getDb();
  if (!(await hit(db, `eksport:${site.id}`, exportRule))) {
    return { ok: false, message: "Du har laget tre ZIP-filer det siste døgnet. Prøv igjen i morgen." };
  }
  const store = await getMediaStore();
  await startExport(db, store, site, user.id);
  after(() =>
    runExportStep({ db, store, fetchPath: platformFetcher(), email: getEmailProvider() }, site.id).catch((err) => console.error("Eksporten feilet", err)),
  );
  revalidatePath(`/studio/nettsted/${site.id}/innstillinger`, "layout");
  return { ok: true, message: "Filen lages nå. Du får e-post når den er klar." };
}
