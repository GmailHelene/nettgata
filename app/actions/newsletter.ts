"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { getDb, type Db } from "@/db";
import { sites } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/send";
import { consentSentence } from "@/lib/nyhetsbrev/blocks";
import { sendConfirmation } from "@/lib/nyhetsbrev/send";
import { confirmSubscription, isEmail, normalizeEmail, subscribe, unsubscribe } from "@/lib/nyhetsbrev/subscribers";
import { getPublishedPage, normalizePath } from "@/lib/publishing";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

/** Ved feil sendes det den besøkende skrev tilbake, så skjemaet ikke tømmes. `field` får fokus. */
export type NewsletterState = { ok: boolean; message: string; values?: { email: string; name: string }; field?: "email" | "name" } | null;

/** Samme svar uansett om adressen er ny, venter eller allerede står på listen. Skjemaet avslører ikke hvem som abonnerer. */
const THANKS = "Takk! Sjekk e-posten din og trykk på lenken for å bekrefte påmeldingen. Får du ingen e-post, se i søppelposten.";

/** Påmeldingen gjelder bare sider der seksjonen faktisk står publisert, så skjemaet ikke kan brukes på andre nettsteder. */
async function hasSignup(db: Db, siteId: string, path: string, sectionId: string): Promise<boolean> {
  if (!sectionId || sectionId.length > 64) return false;
  const page = await getPublishedPage(db, siteId, path);
  return Boolean(page?.content.sections.some((s) => s.id === sectionId && s.type === "nyhetsbrev" && !s.hidden));
}

/** Kort kode av e-postadressen til grensen per adresse. Selve adressen lagres ikke i rate_limit_events. */
async function emailKey(email: string): Promise<string> {
  const data = new Uint8Array([...getSecret(), ...new TextEncoder().encode(`nyhetsbrev:${email}`)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Påmelding fra seksjonen «Nyhetsbrev» på kundens nettsted. Offentlig, så alt valideres og begrenses. */
export async function subscribeNewsletterAction(siteId: string, _prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  // Honningkrukke: skjult for mennesker. Roboter som fyller feltet, får vanlig svar uten at noe lagres.
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: true, message: THANKS };

  const values = { email: String(formData.get("email") ?? "").trim().slice(0, 254), name: String(formData.get("name") ?? "").trim().slice(0, 100) };
  if (!values.email) return { ok: false, message: "Skriv e-postadressen din.", values, field: "email" };
  if (!isEmail(values.email)) return { ok: false, message: "Sjekk e-postadressen. Den skal se ut som navn@eksempel.no.", values, field: "email" };

  if (!/^[0-9a-f-]{36}$/.test(siteId)) return { ok: false, message: "Påmeldingen er ikke tilgjengelig.", values };
  const db = await getDb();
  const [site] = await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const path = normalizePath(String(formData.get("path") ?? "/").slice(0, 300));
  if (!site || !(await hasSignup(db, site.id, path, String(formData.get("section") ?? "")))) {
    return { ok: false, message: "Påmeldingen er ikke tilgjengelig.", values };
  }

  const ipKey = await clientKey(await headers(), getSecret());
  const allowed =
    (await hit(db, `nyhetsbrev-ip:${ipKey}`, rules.newsletterPerIp)) &&
    (await hit(db, `nyhetsbrev-site:${site.id}`, rules.newsletterPerSite));
  if (!allowed) return { ok: false, message: "Du har prøvd mange ganger på kort tid. Prøv igjen om litt.", values };
  // Grensen per adresse gir samme svar som en vellykket påmelding, men sender ikke flere bekreftelser.
  if (!(await hit(db, `nyhetsbrev-epost:${site.id}:${await emailKey(normalizeEmail(values.email))}`, rules.newsletterPerEmail))) {
    return { ok: true, message: THANKS };
  }

  const result = await subscribe(db, { siteId: site.id, email: values.email, name: values.name, sourcePath: path, consentText: consentSentence(site.name) });
  if (result.sendConfirmation) {
    after(() =>
      sendConfirmation(db, getEmailProvider(), result.subscriberId, result.consentedAt).catch((err) => console.error("Bekreftelse av nyhetsbrev feilet", err)),
    );
  }
  return { ok: true, message: THANKS };
}

export type LinkState = { ok: boolean; message: string } | null;

async function linkAllowed(db: Db) {
  const ipKey = await clientKey(await headers(), getSecret());
  return hit(db, `nyhetsbrev-lenke:${ipKey}`, rules.newsletterLinkPerIp);
}

/** Knappen på bekreftelsessiden. Å åpne lenken alene bekrefter ingenting, fordi virusfiltre åpner lenker av seg selv. */
export async function confirmNewsletterAction(siteId: string, _prev: LinkState, formData: FormData): Promise<LinkState> {
  const db = await getDb();
  if (!(await linkAllowed(db))) return { ok: false, message: "For mange forsøk. Prøv igjen om litt." };
  const result = await confirmSubscription(db, siteId, String(formData.get("t") ?? ""));
  if (result.ok) return { ok: true, message: result.already ? "Påmeldingen er allerede bekreftet. Takk!" : "Takk! Påmeldingen er bekreftet." };
  const messages = {
    ukjent: "Fant ikke påmeldingen. Sjekk at du brukte hele lenken fra e-posten.",
    utlopt: "Lenken er for gammel. Meld deg på igjen, så får du en ny e-post.",
    erstattet: "Denne lenken gjelder en eldre påmelding. Bruk lenken i den nyeste e-posten.",
    avmeldt: "Du har meldt deg av nyhetsbrevet. Vil du ha det igjen, meld deg på på nytt.",
  } as const;
  return { ok: false, message: messages[result.reason] };
}

/** Knappen på avmeldingssiden. Ingen innlogging: nøkkelen i lenken er nok. */
export async function unsubscribeNewsletterAction(siteId: string, _prev: LinkState, formData: FormData): Promise<LinkState> {
  const db = await getDb();
  if (!(await linkAllowed(db))) return { ok: false, message: "For mange forsøk. Prøv igjen om litt." };
  const done = await unsubscribe(db, String(formData.get("t") ?? ""), siteId);
  return done
    ? { ok: true, message: "Du er meldt av, og får ikke flere nyhetsbrev fra oss." }
    : { ok: false, message: "Fant ikke påmeldingen. Sjekk at du brukte hele lenken fra e-posten." };
}
