import type { PageContent, Section } from "@/lib/content/types";
import { formatAddress } from "@/lib/site-info";
import { identitet, kontaktmater, lagSide, norskDato, oppramsing, orgnrTekst, tekstSeksjon, TEKSTVERSJON, type Virksomhet } from "./felles";
import type { Betalingsmate } from "./personvern";

/*
 * UTKAST. Helene må lese teksten før den brukes. Den er ikke juridisk rådgivning.
 *
 * Angrerett og opplysninger før kjøp for nettbutikkene. Sjekket mot Lovdata 1. november 2026:
 * - Angrerettloven (LOV-2014-06-20-27, sist endret ved lov 16. juni 2023 nr. 38):
 *   § 8 opplysninger før kjøp og angreskjema, § 16 knappen «bestilling med forpliktelse til å betale» eller tilsvarende,
 *   § 17 leveringsbegrensninger og betalingsmidler når bestillingen starter, § 18 bekreftelse på varig medium,
 *   § 20 melding og bekreftelse på mottatt melding, § 21 frist (12 måneder ekstra hvis opplysningene mangler),
 *   § 22 unntak, § 24 tilbakebetaling innen 14 dager, § 25 retur innen 14 dager og returkostnad.
 * - § 20 a elektronisk angrefunksjon (tilføyd ved lov 19. juni 2026 nr. 34, i kraft fra den tid Kongen bestemmer, sjekket 8. november 2026).
 *   Funksjonen ligger på /angre-avtalen, med lenke «Angre avtalen» i bunnteksten på alle sider.
 * - Angreskjemaet er standardskjemaet fra Barne- og familiedepartementet (regjeringen.no, «Angrerettskjema»,
 *   sist oppdatert 8. februar 2018). Ordlyden er beholdt.
 * - Forbrukerkjøpsloven § 6 (levering innen 30 dager) og § 27 (reklamasjon innen to eller fem år).
 * - Ehandelsloven § 11 (tekniske steg, arkivering, retting av feil og språk før elektronisk bestilling).
 * - Klage: mekling hos Forbrukertilsynet, så Forbrukerklageutvalget (regjeringen.no, 26. februar 2025). EUs
 *   klageportal (ODR) ble lagt ned 20. juli 2025 (forordning (EU) 2024/3228), så den lenkes ikke til.
 */

/** Unntak fra angreretten (angrerettloven § 22) som er vanlige i små nettbutikker. */
export type Unntak = "tilpasset" | "ferskvare" | "hygiene" | "forseglet-media";

export const STANDARD_UNNTAK: readonly Unntak[] = ["tilpasset", "ferskvare", "hygiene", "forseglet-media"];

const unntakTekst: Record<Unntak, string> = {
  tilpasset: "Varer som er laget etter dine mål eller ønsker, eller som har fått et tydelig personlig preg.",
  ferskvare: "Varer som raskt blir dårlige eller går ut på dato, som ferske matvarer og blomster.",
  hygiene: "Forseglede varer som ikke kan tas tilbake av hensyn til helse eller hygiene, når forseglingen er brutt etter at du fikk varen.",
  "forseglet-media": "Forseglede lyd- og bildeopptak og forseglet programvare, når du har brutt forseglingen.",
};

const unntakKort: Record<Unntak, string> = {
  tilpasset: "varer som er laget etter dine mål eller har fått et tydelig personlig preg",
  ferskvare: "varer som raskt blir dårlige eller går ut på dato",
  hygiene: "forseglede hygieneartikler der forseglingen er brutt etter levering",
  "forseglet-media": "forseglede lyd- og bildeopptak og programvare der forseglingen er brutt",
};

export type AngrerettInput = {
  butikk: Virksomhet;
  /** Adressen varene sendes tilbake til, når den er en annen enn butikkens. Uten navn: butikkens navn settes foran. */
  returadresse?: string;
  /** Hvem som betaler returfrakten når angreretten brukes. Standard er kunden. */
  returfrakt?: "kunden" | "butikken";
  /** For varer som ikke kan sendes i posten, for eksempel møbler: omtrent hva returen koster. */
  returkostnadStoreVarer?: string;
  /** For eksempel «2-5 virkedager». */
  leveringstid?: string;
  /** Hvor butikken sender varer. Standard er Norge. */
  leveringsland?: string;
  betalingsmater?: readonly Betalingsmate[];
  /** Hvilke unntak fra angreretten som skal stå. Standard er de fire vanligste. Tom liste viser ingen. */
  unntak?: readonly Unntak[];
  /** Egen garanti i tillegg til reklamasjonsretten, som én eller flere setninger. */
  garanti?: string;
  oppdatert?: Date | string;
  /** Viser utkastmerknaden. Standard: til Helene har godkjent tekstene (JURIDISK_GODKJENT). */
  utkast?: boolean;
};

/** Teksten på bestillingsknappen. Angrerettloven § 16 annet ledd: uten den blir ikke kunden bundet. */
export const BESTILL_KNAPP = "Bestill med plikt til å betale";

/** «Bestill med plikt til å betale 1 299 kr». */
export function bestillKnapp(total: string): string {
  return `${BESTILL_KNAPP} ${total}`;
}

const punktum = (tekst: string) => (/[.!?]$/.test(tekst.trim()) ? tekst.trim() : `${tekst.trim()}.`);

/** Standard angreskjema, linje for linje, med butikkens navn, adresse og e-post satt inn. */
export function angreskjema(butikk: Virksomhet): string[] {
  const mottaker = [butikk.navn, formatAddress(butikk.info), butikk.info.email].filter(Boolean).join(", ");
  return [
    "Angreskjema ved kjøp av varer og tjenester som ikke er finansielle tjenester",
    "Fyll ut og returner dette skjemaet dersom du ønsker å gå fra avtalen",
    `Utfylt skjema sendes til: ${mottaker}`,
    "Jeg/vi underretter herved om at jeg/vi ønsker å gå fra min/vår avtale om kjøp av følgende: (sett kryss)",
    "☐ varer (spesifiser på linjene nedenfor)",
    "☐ tjenester (spesifiser på linjene nedenfor)",
    "Sett kryss og dato:",
    "☐ Avtalen ble inngått den (dato) (ved kjøp av tjenester)",
    "☐ Varen ble mottatt den (dato) (ved kjøp av varer)",
    "Forbrukerens/forbrukernes navn:",
    "Forbrukerens/forbrukernes adresse:",
    "Dato:",
    "Forbrukerens/forbrukernes underskrift (dersom papirskjema benyttes)",
  ];
}

/** «Du kan betale med Vipps eller kort, eller når du henter varene.» */
function betalingssetning(metoder: readonly Betalingsmate[]): string {
  const navn: Record<"vipps" | "kort" | "stripe" | "klarna" | "kustom" | "faktura", string> = { vipps: "Vipps", kort: "kort", stripe: "kort", klarna: "Klarna", kustom: "Kustom", faktura: "faktura" };
  const unike = [...new Set(metoder)];
  const vanlige = unike.filter((m): m is keyof typeof navn => m in navn).map((m) => navn[m]);
  const henting = unike.includes("ved-henting");
  if (!vanlige.length) return henting ? "Du betaler når du henter varene." : "";
  return `Du kan betale med ${oppramsing(vanlige, "eller")}${henting ? ", eller når du henter varene" : ""}.`;
}

function returadresse(input: AngrerettInput): string {
  return input.returadresse?.trim() || formatAddress(input.butikk.info);
}

function returkostnad(input: AngrerettInput): string[] {
  return [
    input.returfrakt === "butikken"
      ? "Vi betaler returfrakten. Be om returlapp før du sender varen."
      : "Du betaler selv returfrakten. Vi tar ikke gebyr for at du bruker angreretten.",
    input.returkostnadStoreVarer?.trim() ? `Varer som ikke kan sendes i posten, koster omtrent ${input.returkostnadStoreVarer.trim()} å returnere.` : "",
  ].filter(Boolean);
}

/** «på e-post til post@demo.no eller i brev til Demo Rør AS, Storgata 1, 3340 Åmot». */
function meldingskanal(butikk: Virksomhet): string {
  const adresse = formatAddress(butikk.info);
  const deler = [butikk.info.email && `på e-post til ${butikk.info.email}`, adresse && `i brev til ${butikk.navn}, ${adresse}`].filter(Boolean);
  return deler.join(" eller ");
}

/** Siden /angrerett for nettbutikker: angrerett, retur, angreskjema og opplysningene kunden skal ha før kjøpet. */
export function lagAngrerettside(input: AngrerettInput): PageContent {
  const v = input.butikk;
  const retur = returadresse(input);
  const kanal = meldingskanal(v);
  const unntak = [...new Set(input.unntak ?? STANDARD_UNNTAK)];
  const kontakt = kontaktmater(v.info, "og");
  const betaling = betalingssetning(input.betalingsmater ?? []);
  const garanti = input.garanti?.trim();

  const seksjoner: Section[] = [
    tekstSeksjon("angrerett", "Angrerett og retur", [
      `Handler du på nett hos ${v.navn}, har du 14 dagers angrerett. Det betyr at du kan ombestemme deg uten å si hvorfor.`,
      "Fristen regnes fra dagen etter at du har fått varen. Kommer bestillingen i flere pakker, regnes den fra dagen etter at du fikk den siste. Alle kalenderdager teller med. Ender fristen på en lørdag, søndag eller helligdag, forlenges den til neste virkedag. Det holder at du har sendt beskjeden før fristen går ut.",
      `Sist endret ${norskDato(input.oppdatert ?? TEKSTVERSJON)}.`,
    ]),

    tekstSeksjon("angre-slik", "Slik angrer du", [
      "Det enkleste er å bruke «Angre avtalen» nederst på alle sidene i butikken. Du fyller ut navn, hvilket kjøp det gjelder og e-postadressen din, og får kvittering med en gang.",
      kanal
        ? `Du kan også gi oss beskjed før fristen går ut, ${kanal}. Skriv at du vil gå fra kjøpet, og ta gjerne med ordrenummeret.`
        : "Du kan også gi oss skriftlig beskjed før fristen går ut. Skriv at du vil gå fra kjøpet, og ta gjerne med ordrenummeret.",
      "Du kan bruke angreskjemaet lenger ned på siden, men du må ikke. En vanlig e-post holder, så lenge det går klart fram at du angrer. Send beskjeden skriftlig, fordi det er du som må kunne vise at du ga beskjed i tide.",
      v.info.email && "Får vi beskjeden på e-post, bekrefter vi på e-post at vi har fått den.",
    ]),

    tekstSeksjon("angre-retur", "Send varen tilbake", [
      `Send varen tilbake senest 14 dager etter at du ga beskjed om at du angrer. ${retur ? `Returadressen er ${v.navn}, ${retur}.` : "Spør oss om returadresse før du sender."}`,
      ...returkostnad(input),
      "Pakk varen godt inn. Du kan se på og prøve varen for å finne ut hva slags vare det er, hvordan den er og om den virker, slik du kunne gjort i en butikk. Håndterer du den mer enn det, kan du måtte betale for verdien den har tapt.",
    ]),

    tekstSeksjon("angre-penger", "Pengene tilbake", [
      "Vi betaler tilbake alt du har betalt for bestillingen, også vanlig frakt, senest 14 dager etter at vi fikk beskjed om at du angrer. Har du valgt en dyrere leveringsmåte enn standardleveringen vi tilbyr, betaler vi ikke tilbake det den kostet ekstra.",
      "Du får pengene tilbake samme vei som du betalte, med mindre vi avtaler noe annet, og du betaler ikke gebyr for det. Vi kan vente med å betale tilbake til vi har fått varen, eller til du har vist at den er sendt tilbake.",
    ]),

    ...(unntak.length
      ? [
          tekstSeksjon("angre-unntak", "Når angreretten ikke gjelder", [
            "Angreretten gjelder ikke for disse varene:",
            ...unntak.map((u) => unntakTekst[u]),
            "Er en vare unntatt fra angreretten, står det i beskrivelsen av varen.",
          ]),
        ]
      : []),

    tekstSeksjon("angreskjema", "Angreskjema", [
      "Kopier skjemaet inn i en e-post eller skriv det ut, fyll det ut og send det til oss. Du kan også skrive med egne ord.",
      ...angreskjema(v),
    ]),

    tekstSeksjon("reklamasjon", "Hvis noe er galt med varen", [
      "Varen skal være slik vi har beskrevet den, og slik du med rimelighet kan forvente. Er den ikke det, kan du reklamere. Si fra innen rimelig tid etter at du oppdaget feilen. Det er alltid tidsnok hvis du sier fra innen to måneder.",
      "Du kan reklamere i inntil to år etter at du fikk varen, og i fem år hvis varen eller deler av den er ment å vare vesentlig lenger. Etter forbrukerkjøpsloven kan du da få varen rettet eller byttet, få prisavslag eller heve kjøpet, og i noen tilfeller få erstatning.",
      garanti && `I tillegg gir vi denne garantien: ${punktum(garanti)} Garantien kommer i tillegg til reklamasjonsretten og begrenser den ikke.`,
      v.info.email
        ? `Reklamasjon sender du helst skriftlig, på e-post til ${v.info.email}.`
        : kontakt && `Si fra på ${kontakt} hvis noe er galt.`,
    ]),

    tekstSeksjon("for-du-bestiller", "Før du bestiller", [
      [betaling, `Vi sender bare til adresser i ${input.leveringsland?.trim() || "Norge"}.`].filter(Boolean).join(" "),
      "Du bestiller ved å legge varene i handlekurven og gå til kassen. Der fyller du inn navn, e-post og eventuell leveringsadresse, og velger frakt og betaling. Helt til du trykker «Bestill med plikt til å betale», kan du se over varene, frakten og totalprisen og rette det som er feil. Når du trykker på knappen, er bestillingen bindende.",
      "Bestillingen lagres hos oss, og du får en ordrebekreftelse på e-post med en lenke der du kan se den igjen. Kjøpet gjøres på norsk.",
      `${v.info.mvaRegistrert === false ? `${v.navn} er ikke registrert for merverdiavgift, så det er ingen merverdiavgift i prisene.` : "Prisene står med merverdiavgift."} Hva frakten koster, ser du i kassen før du bestiller.`,
      [
        input.leveringstid?.trim() && `Vi sender varene innen ${input.leveringstid.trim()}.`,
        "Er ingenting annet avtalt, skal du ha varene senest 30 dager etter at du bestilte.",
      ]
        .filter(Boolean)
        .join(" "),
    ]),

    tekstSeksjon("selger", "Hvem du handler med", [`Du handler med ${identitet(v)}.${kontakt ? ` Du når oss på ${kontakt}.` : ""}`]),

    tekstSeksjon("klage", "Hvis vi ikke blir enige", [
      "Ta kontakt med oss først, så finner vi som regel en løsning.",
      "Blir vi ikke enige, kan du sende saken til mekling hos Forbrukertilsynet (forbrukertilsynet.no). Fører ikke meklingen fram, kan saken gå videre til Forbrukerklageutvalget, som avgjør tvister om kjøp av varer og om angrerett.",
    ]),
  ];

  return lagSide({
    tittel: `Angrerett og retur | ${v.navn}`,
    beskrivelse: `Du har 14 dagers angrerett hos ${v.navn}. Slik angrer du, sender varen tilbake og får pengene tilbake, med angreskjema.`,
    seksjoner,
    utkast: input.utkast,
  });
}

export type KasseTekster = {
  /** Øverst i kassen, før kunden fyller inn noe (angrerettloven § 17). */
  start: string;
  /** Under kontaktfeltene. */
  personvern: string;
  /** Rett over bestillingsknappen, sammen med oppsummeringen av varer og totalpris (angrerettloven § 16 første ledd). */
  forKnappen: string;
  /** Ved avkrysningsboksen. «kjøpsvilkårene» lenker til termsPath, «angrerett» til /angrerett. */
  vilkar: string;
  /** Teksten på knappen. Beløpet legges til med bestillKnapp(). */
  knapp: string;
  lenker: { angrerett: string; personvern: string };
};

/** Korte tekster til kassen. Bare tekst, så de kan sendes fra serveren til kassen i nettleseren. */
export function kasseTekster(input: { butikk: Virksomhet; betalingsmater?: readonly Betalingsmate[]; leveringsland?: string }): KasseTekster {
  const v = input.butikk;
  const orgnr = orgnrTekst(v);
  return {
    start: [betalingssetning(input.betalingsmater ?? []), `Vi sender bare til adresser i ${input.leveringsland?.trim() || "Norge"}.`]
      .filter(Boolean)
      .join(" "),
    personvern: "Vi bruker opplysningene dine til å levere bestillingen og sende deg ordrebekreftelsen. Les mer i personvernerklæringen.",
    forKnappen: `Du kjøper fra ${v.navn}${orgnr ? `, ${orgnr}` : ""}. Totalprisen i oppsummeringen er med ${v.info.mvaRegistrert === false ? "frakt" : "merverdiavgift og frakt"}. Du har 14 dagers angrerett, regnet fra dagen etter at du får varene, og ordrebekreftelsen med angreskjema kommer på e-post.`,
    vilkar: "Jeg har lest og godtar kjøpsvilkårene og informasjonen om angrerett.",
    knapp: BESTILL_KNAPP,
    lenker: { angrerett: "/angrerett", personvern: "/personvern" },
  };
}

export type Ordrebekreftelse = {
  overskrift: string;
  avsnitt: string[];
  angreskjemaOverskrift: string;
  angreskjema: string[];
  /** Alt over som ren tekst, til tekstversjonen av e-posten. */
  tekst: string;
};

/**
 * Tekst til ordrebekreftelsen på e-post. Angrerettloven § 18: bekreftelsen skal gis på et varig medium og ha med
 * opplysningene i § 8, også angreskjemaet. En lenke til nettsiden er ikke nok, så teksten må stå i selve e-posten.
 */
export function ordrebekreftelseTekster(input: AngrerettInput): Ordrebekreftelse {
  const v = input.butikk;
  const retur = returadresse(input);
  const kanal = meldingskanal(v);
  const unntak = [...new Set(input.unntak ?? STANDARD_UNNTAK)];
  const overskrift = "Angrerett og retur";
  const avsnittListe = [
    input.leveringstid?.trim() ? `Vi sender varene innen ${input.leveringstid.trim()}.` : "",
    `Du har 14 dagers angrerett, regnet fra dagen etter at du fikk varene. Vil du angre, gir du oss beskjed før fristen går ut${kanal ? `, ${kanal}` : ""}. Du kan også bruke «Angre avtalen» nederst på nettsiden vår, eller angreskjemaet under. En vanlig e-post holder.`,
    [`Send varene tilbake senest 14 dager etter at du ga beskjed${retur ? `, til ${v.navn}, ${retur}` : ""}.`, ...returkostnad(input)].join(" "),
    "Vi betaler tilbake alt du har betalt, også vanlig frakt, senest 14 dager etter at vi fikk beskjeden. Vi kan vente til vi har fått varene, eller til du har vist at de er sendt.",
    unntak.length ? `Angreretten gjelder ikke for ${oppramsing(unntak.map((u) => unntakKort[u]), "eller")}.` : "",
    "Er noe galt med en vare, kan du reklamere i inntil to år etter at du fikk den, og i fem år hvis den er ment å vare vesentlig lenger. Si fra så snart du kan etter at du oppdaget feilen.",
    `Du har handlet hos ${identitet(v)}.`,
  ].filter(Boolean);
  const skjema = angreskjema(v);
  return {
    overskrift,
    avsnitt: avsnittListe,
    angreskjemaOverskrift: "Angreskjema",
    angreskjema: skjema,
    tekst: [overskrift, ...avsnittListe, ["Angreskjema", ...skjema].join("\n")].join("\n\n"),
  };
}

/**
 * Siden /kjopsvilkar for nettbutikker. Bygger på de samme opplysningene som angrerettsiden, så de to aldri sier
 * noe forskjellig: avtalen først, så bestilling, selger, angrerett, reklamasjon og klage.
 * En egen side på samme adresse vinner, så butikken kan skrive egne vilkår når den vil.
 */
export function lagKjopsvilkar(input: AngrerettInput): PageContent {
  const v = input.butikk;
  const angrerett = lagAngrerettside({ ...input, utkast: false });
  const etter = (id: string) => angrerett.sections.filter((s) => s.id === id);
  const avtalen = tekstSeksjon("vilkar", "Kjøpsvilkår", [
    `Disse vilkårene gjelder når du som forbruker handler på nett hos ${v.navn}.`,
    "Avtalen består av vilkårene her, det som står om varen og prisen i nettbutikken, og ordrebekreftelsen du får på e-post. Forbrukerkjøpsloven, angrerettloven og ehandelsloven gjelder i tillegg. Gir de deg flere rettigheter enn det som står her, er det loven som gjelder.",
    "Står det noe annet i ordrebekreftelsen enn her, gjelder ordrebekreftelsen, så lenge den ikke gir deg dårligere rettigheter enn loven.",
    `Sist endret ${norskDato(input.oppdatert ?? TEKSTVERSJON)}.`,
  ]);
  const seksjoner: Section[] = [
    avtalen,
    ...etter("for-du-bestiller"),
    ...etter("selger"),
    tekstSeksjon("vilkar-angrerett", "Angrerett", [
      "Du har 14 dagers angrerett, regnet fra dagen etter at du har fått varen. Angreskjemaet og alt om retur står også på siden Angrerett og retur.",
    ]),
    ...angrerett.sections.filter((s) => ["angre-slik", "angre-retur", "angre-penger", "angre-unntak"].includes(s.id)),
    ...etter("reklamasjon"),
    ...etter("klage"),
  ];
  return lagSide({
    tittel: `Kjøpsvilkår | ${v.navn}`,
    beskrivelse: `Kjøpsvilkårene hos ${v.navn}: bestilling, betaling, levering, angrerett, retur og reklamasjon.`,
    seksjoner,
    utkast: input.utkast,
  });
}
