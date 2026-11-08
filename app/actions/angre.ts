"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/send";
import { normalizeEmail } from "@/lib/nyhetsbrev/subscribers";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { registerWithdrawal, withdrawalSchema, type WithdrawalReceipt } from "@/lib/shop/angre";

type Values = { name: string; about: string; email: string };
export type WithdrawalState = { ok: true; receipt: WithdrawalReceipt } | { ok: false; message: string; values: Values; field?: string } | null;

/** Kort kode av e-postadressen. Selve adressen lagres aldri i rate_limit_events. */
async function emailKey(email: string): Promise<string> {
  const data = new Uint8Array([...getSecret(), ...new TextEncoder().encode(`angre:${email}`)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tar imot «Angre avtalen» i kundens nettbutikk. Offentlig, så alt valideres og begrenses. */
export async function submitWithdrawal(siteId: string, _prev: WithdrawalState, formData: FormData): Promise<WithdrawalState> {
  const values: Values = {
    name: String(formData.get("name") ?? "").slice(0, 100),
    about: String(formData.get("about") ?? "").slice(0, 300),
    email: String(formData.get("email") ?? "").slice(0, 120),
  };
  // Honningkrukke: en robot får en vanlig feilmelding, uten at noe lagres eller sendes.
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };

  const parsed = withdrawalSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, values, field: String(parsed.error.issues[0].path[0] ?? "") || undefined };
  if (!/^[0-9a-f-]{36}$/.test(siteId)) return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };

  const db = await getDb();
  const [site] = await db.select({ id: sites.id, kind: sites.kind }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || site.kind !== "nettbutikk") return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };

  // Kvitteringen går til adressen som oppgis, så skjemaet må ikke kunne brukes til å sende mange e-poster til noen.
  const ipKey = await clientKey(await headers(), getSecret());
  const allowed =
    (await hit(db, `angre-epost:${site.id}:${await emailKey(normalizeEmail(parsed.data.email))}`, rules.withdrawalPerEmail)) &&
    (await hit(db, `angre-ip:${ipKey}`, rules.inquiryPerIp)) &&
    (await hit(db, `angre-site:${site.id}`, rules.inquiryPerSite));
  if (!allowed) return { ok: false, message: "Skjemaet er brukt mange ganger på kort tid. Prøv igjen om litt, eller send oss en e-post.", values };

  const receipt = await registerWithdrawal(db, getEmailProvider(), site.id, parsed.data);
  if (!receipt) return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };
  return { ok: true, receipt };
}
