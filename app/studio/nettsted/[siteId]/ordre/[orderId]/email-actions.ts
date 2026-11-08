"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";

/** Sender ordrebekreftelsen og varselet på nytt når utsendingen feilet. Grensen stopper uhell, som mange klikk på rad. */
export async function resendOrderEmailAction(siteId: string, orderId: string): Promise<void> {
  const { site } = await requireSiteAccess(siteId);
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return;
  const db = await getDb();
  const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) return;
  if (!(await hit(db, `epost-paa-nytt:${order.id}`, { limit: 5, windowSeconds: 3600 }))) return;
  await notifyOrderPlaced(db, getEmailProvider(), order.id);
  revalidatePath(`/studio/nettsted/${site.id}/ordre/${order.id}`);
}
