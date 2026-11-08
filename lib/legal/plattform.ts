import type { PageContent, Section } from "@/lib/content/types";
import { GRONBERG, lagSide, norskDato, tekstSeksjon, TEKSTVERSJON } from "./felles";
import { UNDERLEVERANDORER, underleverandorAvsnitt } from "./underleverandorer";

/*
 * UTKAST. Helene må lese tekstene før de brukes. De er ikke juridisk rådgivning.
 *
 * Tekstene for nettgata.no: personvernerklæring, vilkår for abonnement (B2B), databehandleravtale og informasjonskapsler.
 * Grønberg Tech Solutions er behandlingsansvarlig for besøkende, kontoer og fakturering, og databehandler for kundene.
 * Sjekket 1. november 2026:
 * - Personvernforordningen artikkel 13 og 28, og Datatilsynets veileder «Hvordan lage en databehandleravtale?».
 * - Ekomloven § 3-15 og Datatilsynets veileder om samtykke til informasjonskapsler: avvis like lett som godta i første lag,
 *   lukket banner er ikke samtykke, ingen forhåndsavkryssing.
 * - Google Ads: Google er selvstendig behandlingsansvarlig etter «Google Ads Controller-Controller Data Protection Terms».
 *   Googles EU User Consent Policy krever at banneret eller personvernerklæringen lenker til business.safety.google/privacy.
 *   _gcl_au og _gcl_aw varer i 90 dager. Taggen i components/platform/consent.tsx lastes først etter «Ja», med
 *   ad_personalization og analytics_storage avslått.
 * - Stripe: databehandler for betalingen, selvstendig behandlingsansvarlig for blant annet svindelkontroll. Kunder utenfor
 *   Amerika har databehandleravtale med Stripe Payments Europe Limited (Stripe Privacy Center).
 * - Bokføringsloven § 13: fem år for regnskapsdokumentasjon, tre år og seks måneder for avtaler og korrespondanse.
 * - Ehandelsloven § 8: navn, adresse, e-post, org.nr. og om virksomheten er MVA-registrert skal stå på nettstedet.
 *   Adressen står ikke her ennå, se GRONBERG i felles.ts.
 */

/** Prisene er vedtatt 31.10.2026 (docs/PRODUKTSPEK.md). Kroner per måned uten merverdiavgift. */
export const PRISER = {
  nettside: { maned: 199, arlig: 169 },
  nettbutikk: { maned: 399, arlig: 339 },
  tillegg: 249,
  oppstart: { nettside: 3900, nettbutikk: 9900 },
} as const;

/** Hvor lenge sikkerhetskopier lagres. Må stemme med oppsettet av den nattlige sikkerhetskopien. */
export const SIKKERHETSKOPI_DAGER = 30;

/** Hvor lenge studioet er åpent for nedlasting etter at abonnementet er slutt. */
export const EKSPORT_DAGER = 30;

const kr = (belop: number) => `${String(belop).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} kroner`;

const leverandor = () =>
  `${GRONBERG.navn} (org.nr. ${GRONBERG.orgnr} MVA${GRONBERG.adresse ? `, ${GRONBERG.adresse}` : `, ${GRONBERG.sted}`})`;

const sistEndret = (o?: { oppdatert?: Date | string }) => `Sist endret ${norskDato(o?.oppdatert ?? TEKSTVERSJON)}.`;

type Valg = { utkast?: boolean; oppdatert?: Date | string };

/** Personvernerklæringen for nettgata.no. */
export function plattformPersonvern(o: Valg = {}): PageContent {
  const seksjoner: Section[] = [
    tekstSeksjon("personvern", "Personvernerklæring for Nettgata", [
      `Nettgata er en plattform for nettsider og nettbutikker. Den leveres av ${GRONBERG.navn}, som er enkeltpersonforetaket mitt. Jeg heter ${GRONBERG.innehaver} og driver Nettgata selv, fra ${GRONBERG.sted}.`,
      `${leverandor()} er behandlingsansvarlig for opplysningene om deg som besøker nettgata.no, sender meg en forespørsel, har konto i studioet eller er kunde hos meg. Spørsmål om personvern sender du til ${GRONBERG.epost}. Jeg svarer skriftlig, normalt innen én virkedag.`,
      "Lager du en nettside eller nettbutikk med Nettgata, er det du som er ansvarlig for opplysningene om de besøkende og kundene dine. Da er jeg databehandleren din, og databehandleravtalen på nettgata.no/databehandleravtale beskriver hvordan jeg tar vare på dem.",
      sistEndret(o),
    ]),

    tekstSeksjon("besok", "Når du besøker nettgata.no", [
      "Serveren får IP-adressen din og vet hvilken nettleser du bruker. Det trengs for å vise sidene, og de samme opplysningene brukes til å stoppe angrep og spam. Tekniske logger slettes innen sju dager. Grunnlaget er min berettigede interesse i en trygg tjeneste som virker (personvernforordningen artikkel 6 nr. 1 bokstav f).",
      "Jeg bruker ingen informasjonskapsler til statistikk. Det eneste som måles, er om annonsene virker, og det skjer bare hvis du sier ja. Det står mer om dette under Google Ads og Informasjonskapsler lenger ned.",
    ]),

    tekstSeksjon("annonser", "Google Ads, bare med samtykke", [
      "Jeg annonserer for Nettgata hos Google. For å se om annonsene virker, vil jeg vite om du kom fra en annonse og sendte skjemaet. Da må Google lagre en informasjonskapsel i nettleseren din, og det skjer bare hvis du svarer ja i banneret. Svarer du nei, eller lar være å svare, lastes ikke Google-taggen i det hele tatt.",
      "Sier du ja, får Google opplysninger om besøket, blant annet IP-adressen din, at du klikket på en annonse og at du sendte skjemaet. Jeg bruker det bare til å måle annonsene. Jeg bruker det ikke til å vise deg annonser senere, og ikke til statistikk.",
      "Google er selv behandlingsansvarlig for det Google gjør med opplysningene, og kan overføre dem til USA. Google er sertifisert under EU-U.S. Data Privacy Framework. Hvordan Google bruker opplysninger fra annonsører, kan du lese på business.safety.google/privacy.",
      "Grunnlaget er samtykket ditt (artikkel 6 nr. 1 bokstav a, og ekomloven § 3-15). Du kan trekke det tilbake når som helst med lenken «Informasjonskapsler» nederst på siden.",
    ]),

    tekstSeksjon("foresporsel", "Når du sender skjemaet «Få nettside»", [
      "Jeg lagrer navnet ditt, e-postadressen, telefonnummeret hvis du oppgir det, navnet på bedriften, hva du trenger, bransjen, meldingen din og hvilken side du sendte fra. Jeg bruker det til å svare deg og lage et forslag.",
      "Grunnlaget er at du har bedt om svar og kanskje et tilbud (artikkel 6 nr. 1 bokstav b). Blir du ikke kunde, sletter jeg forespørselen senest tolv måneder etter at vi sist hadde kontakt.",
    ]),

    tekstSeksjon("konto", "Når du har konto i studioet", [
      "For kontoen lagrer jeg e-postadressen og navnet ditt. Passordet lagres bare som en hash som ikke kan leses tilbake. Slår du på tofaktor, lagres hemmeligheten kryptert. Hvem som har endret og publisert hva, logges, slik at du kan se historikken og gå tilbake til en tidligere versjon.",
      "Grunnlaget er avtalen med deg (artikkel 6 nr. 1 bokstav b). Kontoen og loggene slettes når abonnementet er slutt og perioden for nedlasting er over, slik vilkårene beskriver.",
      "Lager du konto selv, lagrer jeg også når du godtok vilkårene og hvilken versjon du godtok. En konto der e-posten ikke er bekreftet, slettes etter sju dager. Har et nettsted uten abonnement ikke vært brukt i studioet på 60 dager, får du varsel på e-post. Logger du ikke inn eller velger abonnement innen 14 dager etter varselet, slettes nettstedet med sider, tekster og bilder.",
    ]),

    tekstSeksjon("kunde", "Når du er kunde", [
      "For å levere abonnementet og sende faktura lagrer jeg navn og organisasjonsnummer på virksomheten, kontaktpersonen, e-postadressen, fakturaadressen, hvilket abonnement du har og hva du har betalt.",
      "Kortbetaling går gjennom Stripe. Stripe Payments Europe Limited behandler betalingen for meg, og Stripe er selv behandlingsansvarlig for blant annet kontroll mot svindel og hvitvasking. Jeg ser aldri hele kortnummeret ditt.",
      "Grunnlaget er avtalen (artikkel 6 nr. 1 bokstav b) og bokføringsloven (bokstav c). Fakturaer og annen regnskapsdokumentasjon oppbevares i fem år etter utgangen av regnskapsåret. Avtaler og korrespondanse som hører til regnskapet, oppbevares i tre år og seks måneder.",
      "Jeg sender deg e-post om abonnementet, fakturaer og viktige endringer i tjenesten. Nyhetsbrev får du bare hvis du har sagt ja til det.",
    ]),

    tekstSeksjon("mottakere", "Hvem som får opplysningene", [
      "Jeg bruker noen få leverandører for å drive Nettgata. Cloudflare kjører nettstedet og stopper angrep, databasen ligger hos Neon i Frankfurt, og Brevo sender e-post. Stripe tar imot betaling. Sier du ja til annonsemåling, får Google opplysninger om annonseklikk.",
      "Hele listen over leverandører som behandler data for kundenettstedene, med hvor dataene ligger, står i databehandleravtalen.",
      "Regnskapet deles med regnskapsfører og Skatteetaten når loven krever det. Jeg selger aldri opplysninger om deg.",
    ]),

    tekstSeksjon("utenfor-eos", "Overføring til USA", [
      "Flere av leverandørene er amerikanske selskaper eller bruker underleverandører i USA, blant annet Cloudflare, Neon, Stripe og Google. Opplysninger kan derfor bli behandlet i USA. Overføringene bygger på EU-U.S. Data Privacy Framework og EUs standardkontraktsbestemmelser. Databasen ligger i Frankfurt.",
    ]),

    tekstSeksjon("rettigheter", "Rettighetene dine", [
      "Du kan be om innsyn i opplysningene jeg har om deg, og om at de blir rettet eller slettet. Du kan også be meg begrense bruken, protestere mot bruk som bygger på berettiget interesse, og få utlevert opplysninger du har gitt meg i et vanlig filformat. Samtykke kan du trekke tilbake når som helst.",
      `Skriv til ${GRONBERG.epost}, så svarer jeg senest innen én måned. Regnskapsmateriale kan jeg ikke slette før fristene i bokføringsloven har gått ut.`,
      "Mener du at jeg behandler opplysningene dine i strid med reglene, kan du klage til Datatilsynet (datatilsynet.no). Si gjerne fra til meg først, så jeg får rettet det.",
      "Jeg tar ikke avgjørelser om deg som bare bygger på automatisk behandling.",
    ]),

    tekstSeksjon("informasjonskapsler", "Informasjonskapsler", [
      "Ekomloven § 3-15 sier at ingenting skal lagres i nettleseren din uten samtykke, med mindre det er strengt nødvendig for tjenesten du har bedt om. Slik bruker nettgata.no lagring i nettleseren.",
      "Svaret ditt i banneret lagres i nettleseren under navnet nettgata-samtykke, så du slipper å svare på hver side. Det er nødvendig og ligger der til du ombestemmer deg eller tømmer nettleseren.",
      "Logger du inn i studioet, lagres informasjonskapselen sesjon, som holder deg innlogget i 14 dager. Bruker du tofaktor, lagres også sesjon-kode i fem minutter mens du skriver inn koden. Begge er nødvendige for innloggingen og brukes bare i studioet.",
      "Sier du ja til annonsemåling, lagrer Google informasjonskapslene _gcl_au og, hvis du kom fra en annonse, _gcl_aw. De varer i 90 dager. Google kan også lese sine egne informasjonskapsler på Googles domener, som google.com og doubleclick.net.",
      "Du ombestemmer deg med lenken «Informasjonskapsler» nederst på siden. Sier du nei etter å ha sagt ja, lastes siden på nytt uten Google-taggen. Informasjonskapsler Google allerede har lagret, kan du slette i nettleseren.",
      "Kundenettstedene på Nettgata bruker ikke informasjonskapsler til statistikk eller annonser, og trenger derfor ikke banner.",
    ]),

    tekstSeksjon("endringer", "Endringer", [
      "Endrer jeg hvordan jeg bruker personopplysninger, oppdaterer jeg denne siden og datoen øverst. Er du kunde og endringen betyr noe for deg, får du også beskjed på e-post.",
    ]),
  ];

  return lagSide({
    tittel: "Personvernerklæring | Nettgata",
    beskrivelse: "Hva Grønberg Tech Solutions lagrer om deg som besøker nettgata.no eller er kunde, hvorfor, hvor lenge og hvilke rettigheter du har.",
    seksjoner,
    utkast: o.utkast,
  });
}

/** Vilkår for abonnement på Nettgata. Gjelder virksomheter (B2B), ikke forbrukere. */
export function plattformVilkar(o: Valg = {}): PageContent {
  const seksjoner: Section[] = [
    tekstSeksjon("vilkar", "Vilkår for Nettgata", [
      `Disse vilkårene gjelder når virksomheten din har abonnement på Nettgata. Nettgata leveres av ${leverandor()}, som er enkeltpersonforetaket mitt. Når det står «jeg» her, er det ${GRONBERG.navn}. «Du» er virksomheten som har abonnementet.`,
      "Nettgata selges til virksomheter, foreninger og andre som bruker tjenesten i næring eller organisasjon. Kjøpet er derfor ikke et forbrukerkjøp, og angrerettloven gjelder ikke. Avtalen er inngått når du oppretter abonnementet og godtar vilkårene. Databehandleravtalen på nettgata.no/databehandleravtale er en del av avtalen.",
      sistEndret(o),
    ]),

    tekstSeksjon("tjenesten", "Hva du får", [
      "Du får det som står i beskrivelsen av abonnementet på nettgata.no da du bestilte, blant annet drift, SSL, daglig sikkerhetskopi og studioet der du redigerer nettstedet. Med nettbutikk får du også varer, lager, kasse, frakt og kobling til betalingsløsningene dine. Jeg tar ikke gebyr av salget ditt.",
      "Jeg utvikler Nettgata hele tiden. Funksjoner kan bli endret eller erstattet, men jeg tar ikke bort noe som er vesentlig for deg uten å si fra minst 30 dager før.",
      "Brukerstøtte får du skriftlig, på e-post eller i studioet. Jeg svarer normalt innen én virkedag.",
    ]),

    tekstSeksjon("pris", "Pris og betaling", [
      `Prisene er uten merverdiavgift. Nettside koster ${kr(PRISER.nettside.maned)} i måneden, eller ${kr(PRISER.nettside.arlig)} i måneden ved årlig betaling. Nettbutikk koster ${kr(PRISER.nettbutikk.maned)} i måneden, eller ${kr(PRISER.nettbutikk.arlig)} i måneden ved årlig betaling. Tillegget med daglig AI-team og sosiale medier koster ${kr(PRISER.tillegg)} i måneden.`,
      `Vil du at jeg setter opp nettstedet for deg, koster oppstart ${kr(PRISER.oppstart.nettside)} for nettside og ${kr(PRISER.oppstart.nettbutikk)} for nettbutikk. Vi avtaler hva som er med før jeg begynner, og oppstarten betales på forskudd. Det som ikke er med, tilbyr jeg til fast pris eller timepris.`,
      "Abonnementet betales på forskudd for en måned eller et år om gangen, med kort gjennom Stripe. Feiler betalingen, får du beskjed på e-post. Er beløpet fortsatt ikke betalt 14 dager etter forfall, kan jeg sette nettstedet og studioet på pause etter et nytt varsel, til det er betalt. Forsinkelsesrente beregnes etter forsinkelsesrenteloven.",
      "Jeg kan endre prisene med minst 30 dagers varsel på e-post. Betaler du årlig, gjelder ny pris fra neste fornyelse.",
      "Er første års .no-domene inkludert i abonnementet ditt, betaler jeg registreringen det første året. Domenet registreres likevel alltid med deg som innehaver.",
    ]),

    tekstSeksjon("oppsigelse", "Oppsigelse", [
      "Månedlig abonnement kan du si opp når som helst. Det løper ut måneden du har betalt for.",
      "Årlig abonnement fornyes automatisk for ett år om gangen. Du kan si det opp når som helst, og det løper da ut perioden du har betalt for. Jeg sender deg en påminnelse på e-post minst 30 dager før fornyelsen.",
      "Du får ikke penger tilbake for tid du ikke har brukt, med mindre det er jeg som avslutter avtalen uten at du har brutt den. Da får du tilbake det du har betalt for resten av perioden.",
      "Jeg kan si opp avtalen med tre måneders varsel. Skulle jeg legge ned Nettgata, hjelper jeg deg med å flytte. Bryter du vilkårene vesentlig, for eksempel med ulovlig innhold eller ved å la være å betale etter varsel, kan jeg si opp avtalen med umiddelbar virkning. Ulovlig innhold kan jeg ta ned med en gang.",
    ]),

    tekstSeksjon("data", "Dataene dine når avtalen slutter", [
      "Det du har lagt inn, er ditt. Du kan når som helst laste ned varer, kunder, ordre og rapporter som regneark (CSV) i studioet. Tekster og bilder sender jeg deg i vanlige filformater hvis du ber om det.",
      `Når abonnementet er slutt, er nettstedet ikke lenger publisert, men studioet er åpent for nedlasting i ${EKSPORT_DAGER} dager. Deretter sletter jeg dataene. Sikkerhetskopier slettes etter hvert som de blir eldre enn ${SIKKERHETSKOPI_DAGER} dager, så alt er borte senest ${EKSPORT_DAGER + SIKKERHETSKOPI_DAGER} dager etter at abonnementet sluttet.`,
      "Du kan lage og forhåndsvise et nettsted gratis før du velger abonnement. Et slikt nettsted kan ikke publiseres, og det har plass til 200 MB bilder og filer. Har det ikke vært brukt i studioet på 60 dager, får du varsel på e-post, og det slettes 14 dager senere hvis du ikke logger inn eller velger abonnement.",
      "Du må selv ta vare på regnskapsmateriale som bokføringsloven krever, for eksempel salgsdokumentasjon. Nettgata er ikke et arkiv for regnskapet ditt, så last ned ordrene jevnlig eller send dem til regnskapssystemet ditt.",
      "Domenet er ditt hele tiden. Jeg hjelper deg med å peke det til et annet sted når du flytter.",
    ]),

    tekstSeksjon("ditt-ansvar", "Ditt ansvar", [
      "Du er ansvarlig for innholdet på nettstedet ditt, altså tekster, bilder, priser og varer. Du må ha rett til å bruke bildene og tekstene, og omtaler skal være ekte.",
      "Temaene og seksjonene i Nettgata er laget for å oppfylle kravene til universell utforming etter WCAG 2.0. Innholdet du legger inn selv, må også være universelt utformet. Det gjelder for eksempel alternativ tekst på bilder, tekst i bilder, lenketekster og dokumenter du laster opp.",
      "Overfor kundene dine er det du som er selger. Du har ansvaret for kjøpsvilkår, priser og førpriser, merverdiavgift, angrerett, reklamasjoner og bokføring. Nettgata hjelper med maler og automatikk, men den juridiske plikten er din.",
      "Avtalene med Stripe (kort), Vipps MobilePay, Klarna, Kustom, Posten Bring, Fiken og andre leverandører inngår du selv. Pengene fra salget går rett til deg, og gebyrene følger avtalene dine med dem. Jeg er ikke part i de avtalene og har ikke ansvar for tjenestene deres.",
      "Du er behandlingsansvarlig for personopplysningene om besøkende og kunder på nettstedet ditt. Personvernerklæringen Nettgata lager, bygger på valgene dine i studioet. Les den, og si fra hvis noe ikke stemmer.",
      "Pass på passordene og hvem som har tilgang til studioet, og slå på tofaktor. Tror du at noen uvedkommende har kommet seg inn, sier du fra til meg med en gang.",
      "Du kan ikke bruke Nettgata til ulovlig innhold, til å selge varer det er forbudt å selge, eller til å sende spam.",
    ]),

    tekstSeksjon("ai", "AI-rapporten og AI-teamet", [
      "AI-rapporten og AI-teamet lager forslag til tekster, innlegg og endringer. Ingenting endres på nettstedet ditt før du trykker Godkjenn. Les forslagene før du godkjenner dem. AI kan ta feil, og det du godkjenner, blir ditt innhold.",
    ]),

    tekstSeksjon("drift", "Drift og sikkerhet", [
      "Jeg gjør mitt beste for at Nettgata skal være oppe hele tiden, men jeg kan ikke love at tjenesten aldri er nede. Planlagt vedlikehold gjør jeg så langt det går på tider med lite trafikk.",
      "Nettgata tar sikkerhetskopi hver natt. Skjer det et sikkerhetsbrudd som rammer dataene dine, sier jeg fra uten unødig opphold, slik databehandleravtalen beskriver.",
    ]),

    tekstSeksjon("ansvar", "Ansvarsbegrensning", [
      "Jeg er ansvarlig for direkte tap som skyldes at jeg ikke har levert det avtalen sier. Jeg er ikke ansvarlig for indirekte tap, som tapt salg eller fortjeneste, tapte data utover det sikkerhetskopiene dekker, eller krav fra andre mot deg.",
      "Samlet ansvar i et kalenderår er begrenset til det du har betalt for abonnementet de siste tolv månedene. Begrensningene gjelder ikke hvis jeg har opptrådt grovt uaktsomt eller med vilje.",
      "Jeg er ikke ansvarlig for feil eller stans hos Stripe, Vipps MobilePay, Klarna, Kustom, Posten Bring, domeneforhandleren din eller andre tjenester du har egne avtaler med. Det samme gjelder forhold utenfor min kontroll som jeg ikke med rimelighet kunne forutse eller unngå.",
      "Krav må du sette fram skriftlig innen rimelig tid etter at du oppdaget feilen.",
    ]),

    tekstSeksjon("domene", "Domenet ditt", [
      "Domenet registreres alltid med deg som innehaver, aldri med meg. Du kan koble et domene du allerede har, eller kjøpe et nytt hos en forhandler i ditt eget navn. Jeg holder aldri domenet ditt tilbake.",
      "Fornyelse og betaling av domenet skjer hos forhandleren der det er registrert, med mindre første år er inkludert i abonnementet.",
    ]),

    tekstSeksjon("rettigheter", "Rettigheter til innhold og plattform", [
      "Du eier innholdet ditt. Du gir meg rett til å lagre og vise det så lenge det trengs for å levere tjenesten.",
      "Plattformen, temaene, seksjonene og koden er mine. Du får bruke dem så lenge du har abonnement.",
    ]),

    tekstSeksjon("endringer", "Endringer i vilkårene", [
      "Jeg kan endre vilkårene. Du får beskjed på e-post minst 30 dager før endringene gjelder. Er en endring til ulempe for deg, kan du si opp før den trer i kraft og få tilbake det du har betalt for tiden etterpå.",
    ]),

    tekstSeksjon("lov", "Lovvalg og tvister", [
      "Avtalen følger norsk rett. Blir vi uenige, prøver vi først å løse det i minnelighet. Ellers avgjøres saken av de alminnelige domstolene.",
    ]),
  ];

  return lagSide({
    tittel: "Vilkår | Nettgata",
    beskrivelse: "Vilkår for abonnement på Nettgata: pris, oppsigelse, dataene dine, ansvar og domenet i ditt navn.",
    seksjoner,
    utkast: o.utkast,
  });
}

/** Databehandleravtalen mellom kunden (behandlingsansvarlig) og Grønberg Tech Solutions (databehandler). */
export function plattformDatabehandleravtale(o: Valg = {}): PageContent {
  const seksjoner: Section[] = [
    tekstSeksjon("dba", "Databehandleravtale", [
      `Denne avtalen gjelder når du bruker Nettgata til nettside eller nettbutikk. Du er behandlingsansvarlig for personopplysningene om besøkende og kunder på nettstedet ditt. ${leverandor()} er databehandleren din. Når det står «jeg», er det ${GRONBERG.navn}.`,
      "Avtalen oppfyller kravene i personvernforordningen artikkel 28. Den gjelder fra du godtar vilkårene for Nettgata, og så lenge jeg behandler opplysninger for deg. Står denne avtalen og vilkårene mot hverandre, gjelder denne avtalen for personopplysninger.",
      sistEndret(o),
    ]),

    tekstSeksjon("dba-hva", "Hva jeg gjør med opplysningene", [
      "Jeg lagrer og viser nettstedet ditt, teller besøk uten informasjonskapsler, tar imot skjemaer og bestillinger, sender e-post på dine vegne, tar sikkerhetskopi og gir deg brukerstøtte. Jeg behandler opplysningene bare for å levere Nettgata til deg.",
      "Opplysningene gjelder besøkende på nettstedet ditt, folk som sender deg meldinger eller forespørsler, kundene i nettbutikken, de som melder seg på nyhetsbrevet ditt, og brukerne du gir tilgang til studioet.",
      "Det kan være navn, e-postadresse, telefonnummer og adresse, meldinger, ordre og hva som er kjøpt, betalingsmåte og betalingsstatus, påmeldinger til nyhetsbrev, IP-adresser og tekniske logger, og innloggings- og endringslogger for brukerne dine.",
      "Nettgata er ikke laget for helseopplysninger eller andre særlige kategorier av personopplysninger. Du skal ikke be om slike opplysninger i skjemaene uten at vi har avtalt det først.",
    ]),

    tekstSeksjon("dba-instruks", "Instruksene dine", [
      "Denne avtalen, vilkårene og valgene du gjør i studioet er instruksene dine. Jeg følger dem og bruker ikke opplysningene til noe annet, heller ikke til markedsføring eller til å trene AI-modeller.",
      "Mener jeg at en instruks bryter personvernreglene, sier jeg fra med en gang. Krever loven at jeg gir opplysninger til andre, for eksempel til politiet, sier jeg fra til deg først, med mindre loven forbyr det.",
      "Du er ansvarlig for at du har lov til å behandle opplysningene, for at personvernerklæringen din stemmer, og for å svare dem som ber om innsyn eller sletting. Jeg hjelper deg med det.",
    ]),

    tekstSeksjon("dba-taushet", "Taushetsplikt og tilgang", [
      "Jeg har taushetsplikt om opplysningene, også etter at avtalen er slutt. I dag er det bare jeg som har administratortilgang. Får noen andre tilgang, for eksempel en innleid utvikler, skal de ha samme taushetsplikt, og de regnes som en ny underleverandør.",
      "Jeg ser bare på opplysningene dine når det trengs for drift og feilretting, eller når du ber om hjelp.",
    ]),

    tekstSeksjon("dba-sikkerhet", "Sikkerhet", [
      "All trafikk går kryptert over HTTPS, og databasen og bildelageret er kryptert hos leverandørene. Passord lagres bare som en hash som ikke kan leses tilbake, og alle brukere kan slå på tofaktor.",
      "Hvert nettsted har sine egne data, og hver forespørsel sjekkes mot nettstedet den gjelder. Endringer i studioet logges. Gjentatte innloggingsforsøk og skjemaspam stoppes automatisk, og IP-adresser lagres da bare som en kort kode.",
      `Nettgata tar sikkerhetskopi hver natt, og sikkerhetskopier eldre enn ${SIKKERHETSKOPI_DAGER} dager slettes. Hemmelige nøkler ligger aldri i koden.`,
      "Jeg følger med på sikkerhetsvarsler for programvaren Nettgata bruker, og oppdaterer når det trengs.",
    ]),

    tekstSeksjon("dba-underleverandorer", "Underleverandører", [
      "Du gir meg en generell tillatelse til å bruke underleverandørene under. Hver av dem har en databehandleravtale med meg som gir minst samme vern som denne avtalen.",
      "Vil jeg ta i bruk en ny underleverandør eller bytte ut en, sier jeg fra på e-post minst 30 dager før. Du kan protestere. Finner vi ikke en løsning, kan du si opp abonnementet før endringen og få tilbake det du har betalt for tiden etterpå.",
      ...UNDERLEVERANDORER.map(underleverandorAvsnitt),
      "Vipps MobilePay, Klarna, Kustom, Posten Bring og Stripe-kontoen butikken bruker til kort, er ikke underleverandører. Butikken har egne avtaler med dem, og de er selv behandlingsansvarlige for opplysningene de får.",
      "Fiken er heller ikke underleverandør. Kobler du til Fiken, sender jeg bestillingene dit fordi du har bedt om det, og hvordan Fiken behandler dem, følger av avtalen du har med Fiken.",
    ]),

    tekstSeksjon("dba-overforing", "Overføring utenfor EØS", [
      "Jeg overfører bare personopplysninger til land utenfor EØS når det finnes et gyldig grunnlag etter personvernforordningen kapittel V, som EU-U.S. Data Privacy Framework eller EUs standardkontraktsbestemmelser. Faller et slikt grunnlag bort, sier jeg fra og finner en løsning, eller bytter leverandør.",
    ]),

    tekstSeksjon("dba-bistand", "Hjelp med rettigheter, avvik og vurderinger", [
      "Ber noen om innsyn, retting, sletting eller å få ut opplysningene sine, kan du gjøre det meste selv i studioet. Det du ikke kan gjøre selv, hjelper jeg deg med.",
      "Oppdager jeg et brudd på personopplysningssikkerheten som gjelder opplysningene dine, varsler jeg deg uten unødig opphold og senest innen 48 timer. Varselet sier hva som har skjedd, hvilke opplysninger og hvor mange som er berørt, hva det kan føre til og hva jeg har gjort. Da har du det du trenger for å melde fra til Datatilsynet innen 72 timer.",
      "Skal du vurdere personvernkonsekvenser, eller drøfte noe med Datatilsynet, gir jeg deg informasjonen du trenger om hvordan Nettgata virker.",
    ]),

    tekstSeksjon("dba-revisjon", "Dokumentasjon og revisjon", [
      "Du kan be om dokumentasjonen du trenger for å se at jeg følger avtalen. Vil du gjennomføre en revisjon selv eller med en uavhengig revisor, avtaler vi det med minst 30 dagers varsel, og du dekker egne kostnader.",
      "For underleverandørene bruker vi deres egne revisjonsrapporter og sertifiseringer.",
    ]),

    tekstSeksjon("dba-slutt", "Når avtalen slutter", [
      `Når abonnementet er slutt, kan du laste ned dataene dine i ${EKSPORT_DAGER} dager. Deretter sletter jeg dem. Sikkerhetskopier slettes etter hvert som de blir eldre enn ${SIKKERHETSKOPI_DAGER} dager, så alt er borte senest ${EKSPORT_DAGER + SIKKERHETSKOPI_DAGER} dager etter at abonnementet sluttet. Vil du ha dataene slettet før, sier du fra.`,
      "Jeg tar ikke vare på personopplysninger for deg etter dette, med mindre loven krever det.",
      "Oppfyller jeg ikke denne avtalen eller kravene i personvernforordningen, kan du si opp abonnementet med umiddelbar virkning og få tilbake det du har betalt for tiden etterpå.",
    ]),

    tekstSeksjon("dba-ansvar", "Ansvar og lovvalg", [
      "Ansvar for skade følger personvernforordningen artikkel 82. Ellers gjelder ansvarsbegrensningen i vilkårene så langt loven tillater det. Avtalen følger norsk rett.",
    ]),
  ];

  return lagSide({
    tittel: "Databehandleravtale | Nettgata",
    beskrivelse: "Databehandleravtale for Nettgata: hva som behandles, sikkerhet, underleverandører, hvor dataene ligger og sletting.",
    seksjoner,
    utkast: o.utkast,
  });
}

export type PlattformDokument = "personvern" | "vilkar" | "databehandleravtale";

/** Samme navn som juridisk-rutene i lib/platform-routes.ts. */
export function plattformDokument(dokument: PlattformDokument, o: Valg = {}): PageContent {
  switch (dokument) {
    case "personvern":
      return plattformPersonvern(o);
    case "vilkar":
      return plattformVilkar(o);
    case "databehandleravtale":
      return plattformDatabehandleravtale(o);
  }
}

/**
 * Forslag til tekst i samtykkebanneret på nettgata.no. Første lag sier hvem (Google), hva, hvor lenge og at data
 * kan gå til USA, og «Nei takk» er like lett som «Ja».
 */
export const SAMTYKKEBANNER = {
  tittel: "Får jeg måle om annonsene virker?",
  tekst: "Sier du ja, lagrer Google en informasjonskapsel i 90 dager, så jeg ser om du kom fra en annonse og sendte skjemaet. Google bestemmer selv over opplysningene og kan overføre dem til USA. Sier du nei, lastes ikke Google-taggen, og du kan ombestemme deg nederst på siden.",
  ja: "Ja, det er greit",
  nei: "Nei takk",
  lesMer: "Les mer",
  lesMerLenke: "/personvern",
} as const;

export type Lagring = {
  navn: string;
  slag: "informasjonskapsel" | "lagring i nettleseren";
  hvem: string;
  formal: string;
  varighet: string;
  nodvendig: boolean;
};

/** Alt nettgata.no lagrer i nettleseren. Må sjekkes mot en skanning når Google-taggen er på. */
export const INFORMASJONSKAPSLER: readonly Lagring[] = [
  {
    navn: "nettgata-samtykke",
    slag: "lagring i nettleseren",
    hvem: "Nettgata",
    formal: "Husker svaret ditt i banneret.",
    varighet: "Til du ombestemmer deg eller tømmer nettleseren.",
    nodvendig: true,
  },
  { navn: "sesjon", slag: "informasjonskapsel", hvem: "Nettgata", formal: "Holder deg innlogget i studioet.", varighet: "14 dager", nodvendig: true },
  {
    navn: "sesjon-kode",
    slag: "informasjonskapsel",
    hvem: "Nettgata",
    formal: "Mellomsteg når du logger inn med tofaktor.",
    varighet: "5 minutter",
    nodvendig: true,
  },
  { navn: "_gcl_au", slag: "informasjonskapsel", hvem: "Google", formal: "Måler om annonser fører til henvendelser.", varighet: "90 dager", nodvendig: false },
  {
    navn: "_gcl_aw",
    slag: "informasjonskapsel",
    hvem: "Google",
    formal: "Husker annonseklikket når du kom fra en annonse.",
    varighet: "90 dager",
    nodvendig: false,
  },
];

/** Signaturfeltene i Word- og PDF-versjonen av databehandleravtalen. Feltene står i samme rekkefølge for begge parter. */
export const DBA_SIGNATUR: readonly { part: string; felt: readonly { etikett: string; verdi?: string }[] }[] = [
  {
    part: "For kunden (behandlingsansvarlig)",
    felt: [{ etikett: "Virksomhet" }, { etikett: "Org.nr." }, { etikett: "Navn" }, { etikett: "Dato" }, { etikett: "Underskrift" }],
  },
  {
    part: `For ${GRONBERG.navn} (databehandler)`,
    felt: [
      { etikett: "Virksomhet", verdi: GRONBERG.navn },
      { etikett: "Org.nr.", verdi: GRONBERG.orgnr },
      { etikett: "Navn", verdi: GRONBERG.innehaver },
      { etikett: "Dato" },
      { etikett: "Underskrift" },
    ],
  },
];
