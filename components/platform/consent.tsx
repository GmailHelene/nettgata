"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { SAMTYKKEBANNER as T } from "@/lib/legal/plattform";

/**
 * Samtykke til Google-taggen på nettgata.no. Ekomloven krever samtykke før noe lagres i nettleseren som ikke er
 * strengt nødvendig, så taggen lastes først etter «Ja». Uten tagg-ID (GOOGLE_ADS_TAG_ID) vises ingenting.
 * Kundenettstedene bruker ikke dette: de har cookiefri statistikk og trenger ikke banner.
 */

const KEY = "nettgata-samtykke";
type Choice = "ja" | "nei" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Valget lagres i localStorage og deles som en ekstern butikk, så banner og bunntekst alltid er enige.
const listeners = new Set<() => void>();
function read(): Choice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "ja" || value === "nei" ? value : null;
  } catch {
    return null;
  }
}
function write(choice: Choice) {
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    // Privat modus eller blokkert lagring: valget gjelder bare denne visningen.
  }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** På serveren vises ikke banneret. Det kommer først når nettleseren vet om kunden har svart. */
const serverChoice = (): Choice => "nei";

function loadTag(tagId: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js forventer selve arguments-objektet, ikke en liste.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Vi bruker taggen bare til å måle henvendelser fra annonser, ikke til remarketing eller statistikk.
  window.gtag("consent", "default", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", tagId);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  document.head.appendChild(script);
}

/**
 * Kalles når skjemaet er lagret. Gjør ingenting uten samtykke, siden taggen da ikke er lastet.
 * Henvendelsens id som transaction_id hindrer at samme henvendelse telles to ganger.
 */
export function trackLead(id: string, sendTo?: string) {
  window.gtag?.("event", "generate_lead", { transaction_id: id });
  if (sendTo) window.gtag?.("event", "conversion", { send_to: sendTo, transaction_id: id });
}

/**
 * Ny konto bekreftet, sett fra Google Ads. Studioet har ikke banneret, men valget fra nettgata.no ligger i samme
 * nettleser. Uten «Ja» der lastes ingenting. Brukerens id som transaction_id gjør at en ny lasting ikke telles to ganger.
 */
export function trackSignup(tagId: string, sendTo: string, id: string) {
  if (!tagId || !sendTo || read() !== "ja") return;
  loadTag(tagId);
  window.gtag?.("event", "conversion", { send_to: sendTo, transaction_id: id });
}

export function SignupConversion({ tagId, sendTo, id }: { tagId: string; sendTo: string; id: string }) {
  useEffect(() => trackSignup(tagId, sendTo, id), [tagId, sendTo, id]);
  return null;
}

export function ConsentBanner({ tagId }: { tagId: string }) {
  const choice = useSyncExternalStore(subscribe, read, serverChoice);
  useEffect(() => {
    if (choice === "ja" && tagId) loadTag(tagId);
  }, [choice, tagId]);

  if (!tagId || choice !== null) return null;
  return (
    <section
      aria-label="Informasjonskapsler"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-xl border border-[#173b6c]/15 bg-white p-5 text-[#173b6c] shadow-xl sm:inset-x-6"
    >
      <p className="font-semibold">{T.tittel}</p>
      <p className="mt-1 text-sm text-[#47525c]">
        {T.tekst}{" "}
        <Link href={T.lesMerLenke} className="underline">
          {T.lesMer}
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => write("ja")} className="rounded-lg bg-[#173b6c] px-4 py-2 font-semibold text-white">
          {T.ja}
        </button>
        <button type="button" onClick={() => write("nei")} className="rounded-lg border-2 border-[#173b6c] px-4 py-2 font-semibold">
          {T.nei}
        </button>
      </div>
    </section>
  );
}

/** Googles informasjonskapsler for annonsemåling. Slettes når noen trekker samtykket. */
function deleteGoogleCookies() {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!/^_gcl_|^_ga|^_gid$/.test(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** Lenken i bunnteksten. Har kunden sagt ja og ombestemmer seg, slettes kapslene og siden lastes uten taggen. */
export function ConsentReset({ tagId }: { tagId: string }) {
  if (!tagId) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const wasYes = read() === "ja";
        write(null);
        if (wasYes) {
          deleteGoogleCookies();
          window.location.reload();
        }
      }}
      className="underline underline-offset-2 hover:no-underline"
    >
      Informasjonskapsler
    </button>
  );
}
