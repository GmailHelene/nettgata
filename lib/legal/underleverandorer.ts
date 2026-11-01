/*
 * UTKAST. Helene må lese listen før den brukes. Den er ikke juridisk rådgivning.
 *
 * Underleverandørene (personvernforordningen artikkel 28 nr. 2 og 4) som behandler kundenes data i Nettgata.
 * Én kilde for databehandleravtalen, personvernerklæringene og Word-versjonen. Sjekket 1. november 2026:
 * - Cloudflare: databehandleravtale v6.4 (fra 3. april 2026) er del av Self-Serve Subscription Agreement, med EUs
 *   standardkontraktsbestemmelser. Sertifisert under Data Privacy Framework (dataprivacyframework.gov, deltaker 5666).
 *   R2: «location hint» er bare et ønske, ikke en garanti. Bare jurisdiksjonen «eu» garanterer lagring i EU.
 *   Workers Logs lagres i 3 dager (gratis) eller 7 dager (betalt plan).
 * - Neon: et Databricks-selskap. Prosjektet ligger i AWS eu-central-1 (Frankfurt). Neon, LLC er dekket av Databricks sin
 *   DPF-sertifisering. Databehandleravtalen er Databricks DPA med standardkontraktsbestemmelser.
 * - Vercel: databasen er bestilt som «Vercel-Managed Integration». Da fakturerer Vercel, og endring og sletting av
 *   databasen skjer i Vercel. Fjernes fra listen når databasen er flyttet til en egen Neon-konto.
 * - Brevo (Sendinblue SAS): databehandleravtalen står i bruksvilkårene. Drift hos OVH i Frankrike og Google Cloud i
 *   Frankrike og Belgia. Overføring til USA og India er nevnt. Brevo, Inc. er DPF-sertifisert.
 * - Anthropic: databehandleravtalen er del av Commercial Terms, med standardkontraktsbestemmelser. Kunder i EØS har
 *   avtale med Anthropic Ireland, Limited. API-data slettes innen 30 dager (privacy.anthropic.com), med unntak for
 *   misbruk (inntil 2 år). Kildene er uenige om DPF-sertifisering, så teksten bygger bare på kontraktsbestemmelsene.
 */

export type UnderleverandorId = "cloudflare" | "neon" | "vercel" | "brevo" | "anthropic";

export type Underleverandor = {
  id: UnderleverandorId;
  /** Kort navn til lister og tabeller. */
  kortnavn: string;
  /** Selskapet og landet det hører hjemme i. */
  selskap: string;
  /** Hele setninger, så de kan settes sammen til avsnitt. */
  oppgave: string;
  opplysninger: string;
  sted: string;
  overforing: string;
  /** Hvilke nettsteder det gjelder. */
  gjelder: string;
};

export const UNDERLEVERANDORER: readonly Underleverandor[] = [
  {
    id: "cloudflare",
    kortnavn: "Cloudflare",
    selskap: "Cloudflare, Inc. (USA)",
    oppgave:
      "Kjører nettstedene og studioet, sender sidene fra datasenteret nærmest den besøkende, stopper angrep, gir kundedomenene sertifikat og lagrer bildene.",
    opplysninger:
      "All trafikk til nettstedene går gjennom Cloudflare, også IP-adresser og det som sendes i skjemaer og bestillinger. Tekniske logger lagres i inntil sju dager.",
    sted: "Forespørsler behandles i datasenteret nærmest den besøkende, for norske besøkende normalt i Europa. Bildelageret er satt opp i Vest-Europa.",
    overforing:
      "Overføring til USA bygger på EUs standardkontraktsbestemmelser i Cloudflares databehandleravtale, og Cloudflare er sertifisert under EU-U.S. Data Privacy Framework.",
    gjelder: "Alle nettsteder.",
  },
  {
    id: "neon",
    kortnavn: "Neon",
    selskap: "Neon, LLC, et Databricks-selskap (USA)",
    oppgave: "Driver databasen der sider, innstillinger, henvendelser, kunder og ordre lagres.",
    opplysninger: "Alt som lagres i plattformen, også personopplysninger i henvendelser, ordre og kundelister.",
    sted: "Databasen ligger hos Amazon Web Services i Frankfurt i Tyskland, som Neon bruker til driften.",
    overforing:
      "Dataene lagres i EU. Neon og Amazon er amerikanske selskaper, og brukerstøtte kan skje fra USA. Det bygger på EUs standardkontraktsbestemmelser og EU-U.S. Data Privacy Framework.",
    gjelder: "Alle nettsteder.",
  },
  {
    id: "vercel",
    kortnavn: "Vercel",
    selskap: "Vercel Inc. (USA)",
    oppgave: "Databasen er bestilt gjennom Vercel Marketplace. Vercel fakturerer databasen og kan endre og slette databasekontoen.",
    opplysninger: "Innholdet i databasen ligger hos Neon, ikke hos Vercel, men Vercel har administrativ tilgang til databasekontoen.",
    sted: "Administrasjonen skjer fra USA.",
    overforing: "Overføring til USA bygger på EUs standardkontraktsbestemmelser i Vercels databehandleravtale.",
    gjelder: "Alle nettsteder, til databasen er flyttet til en egen konto hos Neon.",
  },
  {
    id: "brevo",
    kortnavn: "Brevo",
    selskap: "Sendinblue SAS, som driver Brevo (Frankrike)",
    oppgave: "Sender e-post fra plattformen, som ordrebekreftelser, varsler om nye henvendelser og nyhetsbrev.",
    opplysninger: "Navn og e-postadresse til mottakeren, og innholdet i e-posten.",
    sted: "Brevo lagrer dataene i EU, i Frankrike og Belgia.",
    overforing:
      "Noen av Brevos underleverandører er i USA og India. Overføringene bygger på EUs standardkontraktsbestemmelser, og for USA også på EU-U.S. Data Privacy Framework.",
    gjelder: "Alle nettsteder som sender e-post.",
  },
  {
    id: "anthropic",
    kortnavn: "Anthropic",
    selskap: "Anthropic Ireland, Limited, og Anthropic, PBC (USA)",
    oppgave: "Lager forslagene i den ukentlige AI-rapporten og i AI-teamet. Ingenting endres før kunden trykker Godkjenn.",
    opplysninger:
      "Innholdet på nettstedet, varene og samlede tall. Navn, e-post, adresser og meldinger fra kundenes kunder sendes ikke til Anthropic.",
    sted: "Behandlingen skjer i USA. Anthropic sletter det som sendes inn innen 30 dager, med unntak for saker om misbruk.",
    overforing: "Overføring til USA bygger på EUs standardkontraktsbestemmelser i Anthropics databehandleravtale.",
    gjelder: "Nettsteder med AI-rapport eller AI-team.",
  },
];

/** Én underleverandør som et avsnitt i hele setninger. */
export function underleverandorAvsnitt(u: Underleverandor): string {
  return `${u.selskap}. ${u.oppgave} ${u.opplysninger} ${u.sted} ${u.overforing}`;
}
