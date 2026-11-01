import type { PageContent, Section } from "@/lib/content/types";
import type { PaymentMethod } from "@/lib/shop/settings";
import {
  GRONBERG,
  identitet,
  kontaktmater,
  lagSide,
  norskDato,
  oppramsing,
  tekstSeksjon,
  TEKSTVERSJON,
  type Virksomhet,
} from "./felles";

/*
 * UTKAST. Helene må lese teksten før den brukes. Den er ikke juridisk rådgivning.
 *
 * Personvernerklæringen for et kundenettsted. Kunden er behandlingsansvarlig, Grønberg Tech Solutions er databehandler.
 * Bygger på (sjekket 1. november 2026):
 * - Personvernforordningen artikkel 13 (hva som skal opplyses) og artikkel 6 (behandlingsgrunnlag).
 * - Ekomloven § 3-15 (LOV-2024-12-13-76): samtykke kreves ikke for lagring som er strengt nødvendig for tjenesten
 *   brukeren ber om. Datatilsynets veileder: bruker et nettsted bare slik lagring, skal det ikke ha samtykkebanner.
 * - Bokføringsloven § 13: dokumentasjon av bokførte opplysninger oppbevares i fem år etter regnskapsårets slutt.
 * - Vipps: «Bedriften blir behandlingsansvarlig for de personopplysningene som deles med den», og Vipps er
 *   behandlingsansvarlig for sin egen behandling (vilkår for privatbrukere, 16. oktober 2026). Vipps MobilePay AS heter
 *   Vipps AS fra 12. januar 2027.
 * - Klarna: «independent data controller» (Klarna Merchant Privacy Factsheet).
 * - Posten Bring: «Vi er behandlingsansvarlig for slik informasjon» (personvernerklæringen til Posten Bring-konsernet).
 */

/** Betalingsmåtene i kassen. Klarna kommer i tillegg til dem som finnes i butikkinnstillingene i dag. */
export type Betalingsmate = PaymentMethod | "klarna";

export type PersonvernInput = {
  virksomhet: Virksomhet;
  /** Samme verdier som sites.kind. */
  type: "nettside" | "nettbutikk";
  /** Betalingsmåtene som er slått på. «test» hoppes over. */
  betalingsmater?: readonly Betalingsmate[];
  /** Hvem som tar imot kortbetaling, for eksempel «Vipps MobilePay» eller «Klarna». */
  kortleverandor?: string;
  /** Sender butikken med Posten Bring? Standard er ja for nettbutikker. */
  bring?: boolean;
  /** Kontaktskjema på nettstedet. Standard er ja. */
  kontaktskjema?: boolean;
  /** Bookingsystemene som er bygget inn på de publiserte sidene (embeddedBookingHosts), for eksempel «timma.no». */
  bookingtjenester?: readonly string[];
  /** Egen timebestilling (lib/egen-booking) er i bruk. Standard er nei. */
  egenBooking?: boolean;
  /** Nyhetsbrev med dobbel opt-in. Standard er nei, til nyhetsbrevet er bygget. */
  nyhetsbrev?: boolean;
  /** Ukentlig AI-rapport eller AI-team. Standard er ja, fordi AI-rapporten er med i begge abonnementene. */
  ai?: boolean;
  oppdatert?: Date | string;
  /** Viser utkastmerknaden. Standard: til Helene har godkjent tekstene (JURIDISK_GODKJENT). */
  utkast?: boolean;
};

function betaling(input: PersonvernInput, metoder: readonly Betalingsmate[]): string[] {
  const kort = input.kortleverandor?.trim();
  const tekster: Record<Exclude<Betalingsmate, "test">, string> = {
    vipps:
      "Betaler du med Vipps, skjer betalingen i Vipps-appen. Vipps MobilePay AS (fra 12. januar 2027 Vipps AS) er selv behandlingsansvarlig for opplysningene de behandler om deg der. Vi får beskjed om at betalingen er gjennomført, og ellers bare det du selv velger å dele med oss i appen.",
    klarna:
      "Velger du Klarna, sender vi navn, adresse, e-postadresse, telefonnummer og hva du kjøper til Klarna Bank AB (publ), slik at Klarna kan gi deg betalingsløsningen. Klarna er selv behandlingsansvarlig for opplysningene de bruker til betaling, kredittvurdering og oppfølging, og har sin egen personvernerklæring.",
    kort: `Betaler du med kort, legger du inn kortet hos betalingsleverandøren vår${kort ? `, ${kort}` : ""}. Vi ser aldri hele kortnummeret ditt og lagrer det ikke.`,
    faktura:
      "Velger du faktura, sender vi fakturaen til e-postadressen din. Fakturaen er en del av regnskapet vårt og lagres like lenge som bestillingen.",
    "ved-henting": "Betaler du når du henter varene, registrerer vi bare at bestillingen er betalt.",
  };
  return [...new Set(metoder)].filter((m): m is Exclude<Betalingsmate, "test"> => m !== "test").map((m) => tekster[m]);
}

/**
 * Personvernerklæringen for et kundenettsted, som innhold til siden /personvern.
 * Teksten følger valgene: nettside eller nettbutikk, betalingsmåter, frakt, skjema og nyhetsbrev.
 */
export function lagPersonvernerklaering(input: PersonvernInput): PageContent {
  const v = input.virksomhet;
  const butikk = input.type === "nettbutikk";
  const kontakt = kontaktmater(v.info);
  const skjema = input.kontaktskjema ?? true;
  const ai = input.ai ?? true;
  const metoder = butikk ? (input.betalingsmater ?? []) : [];
  const betalingstekster = betaling(input, metoder);
  const klarna = metoder.includes("klarna");
  const bring = input.bring ?? true;
  const booking = input.bookingtjenester ?? [];
  const enBooking = booking.length === 1 ? booking[0] : null;

  const seksjoner = [
    tekstSeksjon("personvern", "Personvernerklæring", [
      `${v.navn} er ansvarlig for personopplysningene som samles inn på dette nettstedet. Her står det hva vi lagrer, hvorfor vi gjør det, hvor lenge vi tar vare på det og hvilke rettigheter du har.`,
      `Behandlingsansvarlig er ${identitet(v)}. ${kontakt ? `Har du spørsmål om personvern, ta kontakt på ${kontakt}.` : "Har du spørsmål om personvern, ta gjerne kontakt med oss."}`,
      `Sist endret ${norskDato(input.oppdatert ?? TEKSTVERSJON)}.`,
    ]),

    tekstSeksjon("besok", "Når du besøker nettstedet", [
      "Når du åpner en side, får serveren IP-adressen din og vet hvilken nettleser du bruker. Det trengs for å sende siden til deg. De samme opplysningene brukes til å oppdage og stoppe angrep og misbruk. Grunnlaget er vår berettigede interesse i et nettsted som virker og er trygt (personvernforordningen artikkel 6 nr. 1 bokstav f).",
      "Tekniske logger slettes automatisk innen sju dager. Når noen sender et skjema, lagres ikke IP-adressen i klartekst, bare en kort kode som brukes til å stoppe spam. Koden slettes automatisk etter kort tid.",
      `Vi bruker ingen informasjonskapsler til statistikk eller markedsføring, og vi følger deg ikke fra side til side på nettet. Teller vi besøk, skjer det uten informasjonskapsler og uten at vi ser hvem du er. Derfor møter du ikke noe samtykkebanner her.${booking.length ? " Timebestillingen hentes fra en annen leverandør, og bare når du selv åpner den. Mer om det under «Timebestilling»." : ""}`,
      butikk &&
        "Handlekurven lagres i nettleseren din, slik at varene fortsatt ligger der når du kommer tilbake. Den inneholder bare hvilke varer og hvor mange, ikke hvem du er. Lagringen trengs for at handlekurven du selv fyller skal virke, og krever derfor ikke samtykke etter ekomloven § 3-15. Kurven tømmes når du har bestilt, og du kan tømme den selv når du vil.",
    ]),

    skjema &&
      tekstSeksjon("henvendelser", "Når du sender oss en melding", [
        "Skriver du til oss i kontaktskjemaet, lagrer vi navnet ditt, e-postadressen og telefonnummeret du oppgir, selve meldingen og hvilken side du sendte den fra. Meldingen havner i innboksen vår, og vi får et varsel på e-post.",
        "Vi bruker opplysningene til å svare deg og følge opp det du spør om. Gjelder det et kjøp eller et tilbud, er grunnlaget at vi skal kunne inngå en avtale med deg (artikkel 6 nr. 1 bokstav b). Ellers er det vår berettigede interesse i å svare på det du lurer på (bokstav f).",
        "Vi sletter henvendelser når saken er ferdig, og senest tolv måneder etter at vi sist hadde kontakt, med mindre de blir en del av et kundeforhold eller vi må ta vare på dem etter loven.",
      ]),

    booking.length > 0 &&
      tekstSeksjon("timebestilling", "Timebestilling", [
        `Timebestillingen på nettstedet kommer fra ${oppramsing(booking)}. Den lastes først når du trykker på knappen for å åpne den. Da får ${enBooking ?? "leverandøren"} IP-adressen din og vet hvilken nettleser du bruker, og kan lagre informasjonskapsler hos deg.`,
        "Det du fyller inn når du bestiller, går rett til bookingsystemet, og vi får bestillingen derfra. Vi bruker den til å gi deg timen eller plassen du har bestilt. Grunnlaget er avtalen med deg (artikkel 6 nr. 1 bokstav b).",
        `Hva ${enBooking ?? "leverandørene"} selv gjør med opplysningene, står i personvernerklæringen ${enBooking ? "deres" : "til hver av dem"}. Vil du heller bestille uten å åpne bookingsystemet, kan du ta kontakt med oss${kontakt ? ` på ${kontakt}` : ""}.`,
      ]),

    input.egenBooking &&
      tekstSeksjon("egen-timebestilling", "Når du bestiller time", [
        "Bestiller du time på nettstedet, lagrer vi navnet ditt, e-postadressen, telefonnummeret og meldingen din hvis du skriver dem, hva du har bestilt, hos hvem og når. Vi lagrer også om timen blir avbestilt, og når.",
        "Vi bruker opplysningene til å gi deg timen, sende deg en bekreftelse på e-post med lenke for å avbestille, og til å ta kontakt med deg hvis noe endrer seg. Vi får et varsel på e-post når du bestiller eller avbestiller. Grunnlaget er avtalen med deg om timen (personvernforordningen artikkel 6 nr. 1 bokstav b). Navn og e-postadresse må du oppgi, ellers kan vi ikke ta imot bestillingen og sende deg bekreftelsen.",
        "Lenken for å avbestille er personlig. Vi lagrer ikke selve lenken, bare en kode som gjør at vi kjenner den igjen når du bruker den.",
        "Bookingen slettes automatisk tolv måneder etter timen. Blir timen en del av et kjøp vi må bokføre, tar vi vare på opplysningene regnskapet trenger så lenge bokføringsloven krever det, som er fem år etter utgangen av regnskapsåret (bokstav c).",
      ]),

    butikk &&
      tekstSeksjon("handel", "Når du handler hos oss", [
        "Når du bestiller, trenger vi navn og e-postadresse, og leveringsadresse hvis varene skal sendes. Telefonnummer er valgfritt. Vi lagrer også hva du har kjøpt, pris, frakt, betalingsmåte, eventuell rabattkode og meldingen din til oss. Navn og e-post, og adresse når varene skal sendes, må du oppgi. Ellers kan vi ikke ta imot bestillingen.",
        "Vi bruker opplysningene til å levere varene, sende ordrebekreftelse og beskjed når pakken er sendt, og til å behandle angrerett og reklamasjoner. Grunnlaget er kjøpsavtalen med deg (artikkel 6 nr. 1 bokstav b).",
        "Bokføringsloven krever at vi tar vare på salgsdokumentasjon i fem år etter utgangen av regnskapsåret. Grunnlaget er da den rettslige plikten (bokstav c). En bestilling fra 2026 slettes altså etter utgangen av 2031.",
        "Vi har en enkel kundeliste med navn, e-postadresse og telefonnummer, så vi ser hvem som har handlet hos oss før og kan hjelpe deg raskere. Grunnlaget er vår berettigede interesse i å holde orden på kundeforholdet (bokstav f). Vi bruker ikke kundelisten til markedsføring uten at du har sagt ja, og vi sletter deg fra den når vi ikke lenger må ta vare på noen av bestillingene dine.",
      ]),

    butikk && betalingstekster.length > 0 && tekstSeksjon("betaling", "Betaling", betalingstekster),

    butikk &&
      tekstSeksjon("frakt", "Frakt", [
        bring
          ? "Sender vi varene med Posten Bring, får Posten Bring AS navn, adresse, telefonnummer og e-postadresse, slik at de kan levere pakken og varsle deg underveis. Posten Bring er selv behandlingsansvarlig for opplysningene de bruker til leveringen."
          : "Sender vi varene, får fraktselskapet navn, adresse og kontaktopplysninger, slik at de kan levere pakken og varsle deg.",
        "Henter du varene selv, deler vi ingenting med et fraktselskap.",
      ]),

    input.nyhetsbrev &&
      tekstSeksjon("nyhetsbrev", "Nyhetsbrev", [
        "Melder du deg på nyhetsbrevet, lagrer vi e-postadressen din, navnet hvis du oppgir det, og når du meldte deg på. Du får først en e-post der du bekrefter påmeldingen, og vi sender ingen nyhetsbrev før du har bekreftet.",
        "Grunnlaget er samtykket ditt (artikkel 6 nr. 1 bokstav a). Du melder deg av med lenken nederst i hvert nyhetsbrev. Da slutter vi å sende, men tar vare på at du har meldt deg av, så du ikke får nyhetsbrev ved en feil senere.",
      ]),

    tekstSeksjon("databehandlere", "Hvem som hjelper oss", [
      `Nettstedet vårt er laget med og driftes av Nettgata, som leveres av ${GRONBERG.navn} (org.nr. ${GRONBERG.orgnr}). ${GRONBERG.navn} behandler opplysningene på våre vegne etter en databehandleravtale og får ikke bruke dem til noe annet.`,
      "Nettgata bruker blant annet Cloudflare til drift, sikkerhet og bilder, Neon til databasen i Frankfurt og Brevo til e-post. Hele listen, med hvor dataene ligger, står i databehandleravtalen på nettgata.no/databehandleravtale.",
      ai &&
        "Bruker vi AI-forslagene i Nettgata, leser Anthropic innholdet på nettstedet for å foreslå forbedringer. Det du sender oss i skjemaer og bestillinger, sendes ikke dit.",
      butikk && "Når bestillingen skal bokføres, får regnskapsføreren eller regnskapssystemet vårt opplysningene som trengs til det.",
      "Vi selger aldri opplysninger om deg. Utover det som står her, gir vi dem bare videre når loven krever det.",
    ]),

    tekstSeksjon("utenfor-eos", "Overføring til land utenfor EØS", [
      "Databasen ligger i Frankfurt, og bildene lagres i Vest-Europa. Noen av leverandørene er amerikanske selskaper, blant annet Cloudflare og Neon, og opplysninger kan bli behandlet i USA. Overføringene bygger på EU-U.S. Data Privacy Framework og EUs standardkontraktsbestemmelser, som skal gi et vern på samme nivå som i EØS.",
    ]),

    tekstSeksjon("rettigheter", "Rettighetene dine", [
      "Du kan be om innsyn i opplysningene vi har om deg, og be om at de blir rettet eller slettet. Du kan også be oss begrense bruken, protestere mot bruk som bygger på berettiget interesse, og få utlevert opplysninger du har gitt oss i et vanlig filformat. Har du gitt samtykke, kan du trekke det tilbake når som helst.",
      `Ta kontakt ${kontakt ? `på ${kontakt}` : "med oss"}, så svarer vi så raskt vi kan og senest innen én måned.${butikk ? " Bestillinger vi må ta vare på etter bokføringsloven, kan vi ikke slette før fristen har gått ut." : ""}`,
      "Mener du at vi behandler opplysningene dine i strid med reglene, kan du klage til Datatilsynet (datatilsynet.no). Vi setter pris på om du sier fra til oss først, så vi får rettet det.",
      `Vi tar ikke avgjørelser om deg som bare bygger på automatisk behandling.${klarna ? " Velger du Klarna, kan Klarna gjøre en automatisk kredittvurdering. Det står mer om det i Klarnas personvernerklæring." : ""}`,
    ]),

    tekstSeksjon("endringer", "Endringer", [
      "Endrer vi hvordan vi bruker personopplysninger, oppdaterer vi denne siden og datoen øverst.",
    ]),
  ].filter((s): s is Section => Boolean(s));

  return lagSide({
    tittel: `Personvernerklæring | ${v.navn}`,
    beskrivelse: `Hva ${v.navn} lagrer om deg, hvorfor, hvor lenge og hvilke rettigheter du har.`,
    seksjoner,
    utkast: input.utkast,
  });
}
