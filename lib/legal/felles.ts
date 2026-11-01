import type { PageContent, Section } from "@/lib/content/types";
import { osloDate } from "@/lib/oslo-time";
import { formatAddress, formatOrgnr, type SiteInfo } from "@/lib/site-info";

/*
 * UTKAST. Helene må lese alle tekstene i lib/legal før de brukes. Tekstene er ikke juridisk rådgivning.
 * Regelverket bak er sjekket mot primærkildene 1. november 2026. Kilden står ved regelen der den brukes.
 */

/**
 * Settes til true når Helene har lest og godkjent tekstene. Til da står det «Utkast» øverst på hver side,
 * så en juridisk tekst aldri publiseres som ferdig ved et uhell.
 */
export const JURIDISK_GODKJENT = true;

/** Datoen tekstene sist ble endret og sjekket mot regelverket. Vises som «Sist endret». */
export const TEKSTVERSJON = "2026-11-01";

export const UTKAST_MERKNAD = "Utkast. Teksten er ikke ferdig gjennomgått, og den er ikke juridisk rådgivning.";

/**
 * Leverandøren av Nettgata. Ehandelsloven § 8 krever navn, adresse, e-post og org.nr. på nettgata.no.
 * Adressen valgte Helene 01.11.2026, og den vises i bunnen av hver side og i de juridiske tekstene.
 */
export const GRONBERG = {
  navn: "Grønberg Tech Solutions",
  orgnr: "927 889 404",
  innehaver: "Helene Åsheim Grønberg",
  epost: "kontakt@helene.cloud",
  sted: "Modum",
  adresse: "Stadionveien 1A, 3340 Åmot" as string,
} as const;

/** Virksomheten teksten gjelder: navnet som vises og kontaktinfo fra Innstillinger (én kilde). */
export type Virksomhet = {
  navn: string;
  info: SiteInfo;
  /** Registrert i Merverdiavgiftsregisteret. Gir «MVA» etter org.nr., som ehandelsloven § 8 krever. */
  mva?: boolean;
};

type Del = string | false | null | undefined;

const maneder = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

/** «1. november 2026». Tar en dato (norsk tid) eller «2026-11-01». */
export function norskDato(dato: Date | string): string {
  const iso = typeof dato === "string" ? dato : osloDate(dato);
  const [ar, maned, dag] = iso.split("-").map(Number);
  return `${dag}. ${maneder[maned - 1]} ${ar}`;
}

/** «org.nr. 123 456 789 MVA», eller tom tekst når org.nr. mangler. */
export function orgnrTekst(v: Virksomhet): string {
  if (!v.info.orgnr) return "";
  return `org.nr. ${formatOrgnr(v.info.orgnr)}${v.mva ? " MVA" : ""}`;
}

/** «Demo Rør AS, org.nr. 123 456 789 MVA, Storgata 1, 3340 Åmot». Det som mangler, hoppes over. */
export function identitet(v: Virksomhet): string {
  return [v.navn, orgnrTekst(v), formatAddress(v.info)].filter(Boolean).join(", ");
}

/** «e-post post@demo.no eller telefon 900 00 000». Tom tekst når begge mangler. */
export function kontaktmater(info: SiteInfo, bindeord = "eller"): string {
  const deler = [info.email && `e-post ${info.email}`, info.phone && `telefon ${info.phone}`].filter(Boolean);
  return deler.join(` ${bindeord} `);
}

/** «Vipps, kort og faktura». */
export function oppramsing(ord: readonly string[], bindeord = "og"): string {
  if (ord.length <= 1) return ord.join("");
  return `${ord.slice(0, -1).join(", ")} ${bindeord} ${ord[ord.length - 1]}`;
}

/** Avsnitt skilles med tom linje. Tekstseksjonen gjør hvert avsnitt til et eget <p>. */
export function avsnitt(...deler: Del[]): string {
  return deler.filter((d): d is string => typeof d === "string" && d.trim() !== "").join("\n\n");
}

export function tekstSeksjon(id: string, overskrift: string, deler: Del[]): Section {
  return { id, type: "tekst", variant: "standard", props: { overskrift, brodtekst: avsnitt(...deler) } };
}

/** Kutter ved et helt ord, så tittelen for Google ikke slutter midt i et ord. */
export function kort(tekst: string, maks: number): string {
  const ren = tekst.replace(/\s+/g, " ").trim();
  if (ren.length <= maks) return ren;
  const kuttet = ren.slice(0, maks + 1);
  const mellomrom = kuttet.lastIndexOf(" ");
  return (mellomrom > maks / 2 ? kuttet.slice(0, mellomrom) : ren.slice(0, maks)).replace(/[\s,.;:|-]+$/, "");
}

function medUtkast(seksjon: Section): Section {
  const brodtekst = typeof seksjon.props.brodtekst === "string" ? seksjon.props.brodtekst : "";
  return { ...seksjon, props: { ...seksjon.props, brodtekst: avsnitt(UTKAST_MERKNAD, brodtekst) } };
}

/**
 * Setter sammen siden. Utkastmerknaden står først i den første seksjonen, ikke som egen seksjon,
 * så siden fortsatt har én hovedoverskrift (H1) for skjermlesere og Google.
 */
export function lagSide(o: { tittel: string; beskrivelse: string; seksjoner: Section[]; utkast?: boolean }): PageContent {
  const utkast = o.utkast ?? !JURIDISK_GODKJENT;
  const [forste, ...resten] = o.seksjoner;
  return {
    seo: { title: kort(o.tittel, 70), description: kort(o.beskrivelse, 170) },
    sections: utkast && forste ? [medUtkast(forste), ...resten] : o.seksjoner,
  };
}

/** Teksten på siden som ren tekst, avsnitt for avsnitt. Til Word-versjonen og til testene. */
export function sideSomTekst(innhold: PageContent): { overskrift: string; avsnitt: string[] }[] {
  return innhold.sections.map((s) => ({
    overskrift: typeof s.props.overskrift === "string" ? s.props.overskrift : "",
    avsnitt: (typeof s.props.brodtekst === "string" ? s.props.brodtekst : "").split(/\n\s*\n/).filter(Boolean),
  }));
}

/**
 * Det som mangler i Innstillinger før de juridiske tekstene blir komplette. Kan vises som oppgaver i studioet.
 * Ehandelsloven § 8: navn, adresse, e-post og org.nr. Angrerettloven § 8 bokstav d: også telefon for nettbutikker.
 */
export function juridiskeMangler(v: Virksomhet, o: { nettbutikk: boolean }): string[] {
  const { info } = v;
  const mangler: string[] = [];
  if (!info.email) mangler.push("Legg inn e-postadresse under Innstillinger. Den skal stå i personvernerklæringen og på nettstedet.");
  if (!info.street || !info.postalCode || !info.city) {
    mangler.push("Legg inn adresse under Innstillinger. Ehandelsloven krever navn, adresse og e-post på nettstedet.");
  }
  if (!info.orgnr) mangler.push("Legg inn organisasjonsnummer under Innstillinger. Det skal stå på nettstedet.");
  if (o.nettbutikk && !info.phone) {
    mangler.push("Legg inn telefonnummer under Innstillinger. Kunden skal få det før kjøpet, etter angrerettloven.");
  }
  return mangler;
}
