"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import type { ActionState } from "@/app/studio/actions";
import { ReportPrefsError, savePrefs, type ReportPrefs } from "@/lib/rapport/mottakere";
import { requireSiteAccess } from "@/lib/session";

/** Lagrer hvilke rapporter den innloggede brukeren vil ha på e-post for dette nettstedet. Gjelder bare en selv. */
export async function saveReportPrefsAction(siteId: string, input: ReportPrefs): Promise<ActionState> {
  const { site, user, role } = await requireSiteAccess(siteId);
  try {
    await savePrefs(await getDb(), site.id, user.id, role, { monthlyReport: input?.monthlyReport === true, aiEmail: input?.aiEmail === true });
  } catch (err) {
    if (err instanceof ReportPrefsError) return { ok: false, message: err.message };
    throw err;
  }
  revalidatePath(`/studio/nettsted/${site.id}/innstillinger`);
  return { ok: true, message: "Lagret." };
}
