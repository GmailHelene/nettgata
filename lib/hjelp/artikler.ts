/**
 * Kunnskapsbasen i studioet (/studio/hjelp). Vanlig data i repoet, så den følger koden og kan testes.
 *
 * Regel for alt som står her: beskriv bare det som faktisk er bygget. Sjekk koden før en artikkel skrives eller endres.
 * Ikke nevn Fiken for kunder, forslag til alt-tekst fra AI eller automatisk publisering til Meta. Det finnes ikke.
 * Teksten skal ha ekte æ, ø og å, og ingen tankestrek (tests/hjelp.test.ts sjekker det).
 * Skriftlige kanaler i «Fant du ikke svaret?», aldri telefon.
 */

export const helpCategories = {
  "kom-i-gang": "Kom i gang",
  sider: "Sider, design og bilder",
  synlighet: "Domene og synlighet",
  kunder: "Skjema, booking og nyhetsbrev",
  nettbutikk: "Nettbutikk",
  konto: "Abonnement og konto",
  problemer: "Vanlige problemer",
} as const;
export type HelpCategory = keyof typeof helpCategories;

export type HelpArticle = {
  slug: string;
  title: string;
  category: HelpCategory;
  /** Én setning. Vises i listen og i søketreffene. */
  summary: string;
  /** Avsnitt før stegene. */
  intro?: string[];
  /** Stegene i rekkefølge. */
  steps?: string[];
  /** «Greit å vite» etter stegene. */
  notes?: string[];
  related?: string[];
};

/** Der kunden tar kontakt når artikkelen ikke holder. Skriftlig, aldri telefon. */
export const HELP_CONTACT_EMAIL = "kontakt@helene.cloud";

export const helpArticles: HelpArticle[] = [
  // Kom i gang
  {
    slug: "kom-i-gang",
    title: "Kom i gang med studioet",
    category: "kom-i-gang",
    summary: "Hva du finner hvor, og de første tingene du bør gjøre.",
    intro: [
      "Studioet er der du redigerer nettstedet ditt. Øverst på hvert nettsted ligger fanene: Oversikt, Sider, Design, Bilder og resten. Nettbutikker har i tillegg Varer, Ordre, Kunder, Rabatter, Rapporter og Betaling.",
      "Oversikten viser det som venter på deg, for eksempel nye henvendelser og ordre som skal sendes.",
    ],
    steps: [
      "Gå til «Innstillinger» og «Firma og kontakt», og sjekk navn, adresse, telefon, e-post og åpningstider. De brukes på alle sidene, også i personvernerklæringen.",
      "Gå til «Sider», åpne forsiden og bytt ut eksempeltekstene med dine egne.",
      "Last opp egne bilder under «Bilder», eller rett fra bildefeltet når du redigerer en side.",
      "Trykk «Forhåndsvis» for å se siden slik besøkende ser den.",
      "Velg abonnement under «Abonnement», og publiser sidene.",
      "Koble til eget domene under «Innstillinger» og «Domene» når du er klar.",
    ],
    related: ["rediger-side", "publisere", "abonnement"],
  },
  {
    slug: "rediger-side",
    title: "Rediger en side og legg til seksjoner",
    category: "kom-i-gang",
    summary: "Sider bygges av seksjoner, og alt du skriver lagres av seg selv.",
    intro: ["En side består av seksjoner, for eksempel en toppseksjon, tekst med bilde, tjenester eller kontakt. Du endrer tekst og bilder i skjemaet, og ser resultatet i forhåndsvisningen ved siden av."],
    steps: [
      "Gå til «Sider» og trykk på siden du vil endre.",
      "Trykk på en seksjon for å åpne den, og skriv rett i feltene.",
      "Trykk «+ Legg til seksjon» nederst, eller «+ Legg til seksjon under» i en åpen seksjon, og velg type.",
      "Flytt en seksjon med pilene eller ved å dra den. «Lag kopi» og «Slett seksjonen» finner du nederst i seksjonen.",
      "Trykk «Publiser» når siden er klar.",
    ],
    notes: [
      "Endringene lagres av seg selv. Øverst står det «Lagret kl.» med klokkeslettet.",
      "«Angre» (Ctrl+Z) og «Gjør om» (Ctrl+Y) virker på alt du har gjort siden du åpnet siden.",
      "På mobil viser du siden med «Vis siden».",
      "Nye sider lager du under «Sider» med «Lag side». Huken «I menyen» bestemmer om siden vises i menyen.",
    ],
    related: ["publisere", "bilder", "skjemafelt"],
  },
  {
    slug: "publisere",
    title: "Kladd, publisering og versjoner",
    category: "kom-i-gang",
    summary: "Det du redigerer er en kladd. Besøkende ser den bare etter at du har publisert.",
    intro: [
      "Hver side har en kladd og en publisert versjon. Kladden lagres hele tiden mens du skriver. Det som ligger ute, endres først når du trykker «Publiser».",
      "Hver gang du publiserer, lagres en ny versjon. Øverst i redigereren står det hvilken versjon som er live.",
    ],
    steps: [
      "Trykk «Forhåndsvis» for å se kladden slik besøkende vil se den. Lenken kan deles med andre i sju dager.",
      "Trykk «Publiser» når du er fornøyd.",
      "Vil du tilbake til en tidligere versjon, finn den under «Versjoner» nederst og trykk «Gå tilbake hit». Den publiseres da på nytt, og kladden blir byttet ut med den.",
    ],
    notes: [
      "Under «Sider» kan du publisere alle sidene som ikke er publisert ennå, med én knapp.",
      "Publisering krever betalt abonnement. Du kan redigere og forhåndsvise så mye du vil før det.",
      "Design og innstillinger som navn og åpningstider gjelder med en gang. De har ingen kladd.",
    ],
    related: ["kan-ikke-publisere", "abonnement"],
  },
  {
    slug: "tilganger",
    title: "Gi andre tilgang til nettstedet",
    category: "kom-i-gang",
    summary: "Inviter en kollega som eier, redaktør eller utvikler.",
    steps: [
      "Gå til «Innstillinger» og «Brukere og tilgang».",
      "Under «Inviter noen» skriver du e-postadressen og velger rolle.",
      "Personen får en e-post med en lenke som virker i sju dager.",
    ],
    notes: [
      "Bare eieren kan invitere nye brukere.",
      "Eieren bestemmer over det som styrer penger, personopplysninger og trafikk: abonnement, domene, Vipps og Klarna, omdirigeringer, varsler og eksport av alt.",
      "Del aldri passordet ditt. Inviter heller personen, så har alle sin egen innlogging.",
    ],
    related: ["tofaktor"],
  },

  // Sider, design og bilder
  {
    slug: "design",
    title: "Bytt tema og farger",
    category: "sider",
    summary: "Tema, fargevarianter og stil endrer utseendet uten å røre tekst og bilder.",
    steps: [
      "Gå til «Design».",
      "Velg et tema og trykk «Bruk på nettstedet», eller velg en av fargevariantene.",
      "Vil du justere selv, endre farger og stil, og trykk «Lagre designet».",
    ],
    notes: [
      "Designet gjelder med en gang, også på sidene som er publisert.",
      "Studioet stopper farger som gjør teksten vanskelig å lese, og forteller hva som må endres.",
    ],
    related: ["favicon"],
  },
  {
    slug: "bilder",
    title: "Bilder, alt-tekst og PDF-filer",
    category: "sider",
    summary: "Last opp bilder, skriv hva de viser, og legg ut menyer eller brosjyrer som PDF.",
    intro: ["Alt-teksten er en kort beskrivelse av hva bildet viser. Skjermlesere leser den opp, og Google bruker den. Skriv den selv, for eksempel «Frisør som klipper kort hår»."],
    steps: [
      "Gå til «Bilder» og trykk «Last opp bilder». Du kan velge flere på en gang.",
      "Skriv en beskrivelse i feltet «Beskrivelse (alt-tekst)» under bildet, og trykk «Lagre».",
      "Når du velger bildet i en seksjon, følger beskrivelsen med.",
    ],
    notes: [
      "Bildene krympes av seg selv før de lastes opp. Et bilde kan være opptil 5 MB.",
      "Et bilde kan bare slettes når det ikke brukes på noen side, vare eller som logo. «Vis bare bilder som ikke er i bruk» hjelper deg å rydde.",
      "PDF-filer på opptil 10 MB legger du i filfeltet i en seksjon. De samles under «Bilder».",
      "Bilder som bare pynter, kan stå uten beskrivelse.",
    ],
    related: ["rediger-side"],
  },
  {
    slug: "favicon",
    title: "Ikonet i nettleserfanen",
    category: "sider",
    summary: "Bytt forbokstaven i fanen med logoen din.",
    steps: [
      "Gå til «Design» og «Logo og bunntekst», og finn «Ikon i nettleserfanen».",
      "Last opp et kvadratisk bilde, gjerne logoen, i PNG, WebP, ICO eller JPEG.",
      "Ikonet lagres med en gang.",
    ],
    notes: [
      "Bildet må være minst 48 x 48 piksler. 180 x 180 eller større blir skarpest, også på hjemskjermen til mobilen.",
      "Uten eget ikon vises forbokstaven i navnet, i fargene fra temaet.",
    ],
  },
  {
    slug: "blogg",
    title: "Skriv blogginnlegg",
    category: "sider",
    summary: "Innleggene havner under /blogg, med en oversikt som lages av seg selv.",
    steps: [
      "Gå til «Sider» og finn «Nytt blogginnlegg».",
      "Skriv tittelen og trykk «Lag innlegg».",
      "Skriv innlegget som en vanlig side, og trykk «Publiser».",
    ],
    notes: ["Første gang lages også bloggsiden med oversikten, og den legges i menyen."],
    related: ["publisere", "seo"],
  },
  {
    slug: "skjemafelt",
    title: "Egne felt i kontaktskjemaet",
    category: "kunder",
    summary: "Spør om det du trenger, for eksempel dato, antall gjester eller type oppdrag.",
    steps: [
      "Åpne siden med seksjonen «Kontakt og åpningstider», og velg utseendet «Med kontaktskjema».",
      "Finn «Egne felt i skjemaet» og legg til et felt.",
      "Skriv spørsmålet, velg type, og velg om feltet må fylles ut.",
      "Publiser siden.",
    ],
    notes: [
      "Typene er kort tekst, lang tekst, valgliste, avkrysningsboks, dato, telefon, e-post og bilder. For en valgliste skriver du ett valg per linje.",
      "Med typen «Bilder» kan den som skriver legge ved opptil fem bilder, for eksempel av jobben som skal gjøres. Bildene ses bare i «Henvendelser», av eier og redaktør, og slettes sammen med henvendelsen. Skjemaet kan ha ett slikt felt.",
      "Du kan ha opptil 10 egne felt.",
      "Svarene står under meldingen i «Henvendelser».",
    ],
    related: ["henvendelser"],
  },

  // Domene og synlighet
  {
    slug: "domene",
    title: "Koble til eget domene",
    category: "synlighet",
    summary: "Legg inn to pekere hos domeneforhandleren, så kobler vi til resten.",
    intro: ["Domenet skal stå i ditt eller bedriftens navn. Har du ikke domene ennå, kjøper du det hos en norsk forhandler, for eksempel Domeneshop. Eget domene er med i abonnementet."],
    steps: [
      "Gå til «Innstillinger» og «Domene».",
      "Skriv domenet, for eksempel dinbedrift.no, og trykk «Koble til».",
      "Logg inn hos domeneforhandleren og legg inn pekerne studioet viser: en CNAME for www og en ANAME eller ALIAS for domenet uten www.",
      "Vent. Vi sjekker av oss selv og kobler til med https så snart pekerne er på plass. Du kan også trykke «Sjekk nå».",
    ],
    notes: [
      "Studioet har egne steg for Domeneshop og Webhuset under pekerne.",
      "Pekeren er laget bare for ditt nettsted. Bruk akkurat den verdien studioet viser.",
      "Til domenet er koblet til, ligger nettstedet på gratisadressen.",
      "Bare eieren kan koble til eller fjerne domener.",
    ],
    related: ["domenet-virker-ikke", "abonnement"],
  },
  {
    slug: "seo",
    title: "Synlig i Google: tittel og beskrivelse",
    category: "synlighet",
    summary: "Tittel og beskrivelse lages av seg selv. Skriv egne når du vil styre hva Google viser.",
    intro: ["Står feltene tomme, lager studioet tittel og beskrivelse fra navnet, bransjen, stedet og teksten på siden. Forhåndsvisningen viser det Google får."],
    steps: [
      "Åpne siden i redigereren og trykk «Google og deling».",
      "Vil du styre det selv, skriv «Tittel i Google». Google viser rundt 60 tegn.",
      "Skriv «Beskrivelse i Google», en eller to setninger om hva siden tilbyr. Google viser rundt 160 tegn.",
      "Velg gjerne et delingsbilde. Det vises når siden deles på Facebook, LinkedIn og i meldinger.",
      "Se på listen «Fiks nå», og publiser siden.",
    ],
    notes: [
      "Forhåndsvisningen viser omtrent hvordan siden kan se ut i søkeresultatet.",
      "Nettstedet har kart over sidene (sitemap.xml) som oppdateres av seg selv når du publiserer.",
      "Det tar ofte noen dager før Google viser endringene.",
    ],
    related: ["omdirigeringer", "bilder"],
  },
  {
    slug: "google-bedriftsprofil",
    title: "Synlig i Google Maps: bedriftsprofil",
    category: "synlighet",
    summary: "Bedriftsprofilen gjør at du dukker opp i Google Maps og i kartet når folk søker lokalt. Den er gratis.",
    intro: [
      "Når noen søker «frisør Vikersund» eller «rørlegger Drammen», viser Google et kart med bedrifter øverst. Der kommer du bare med hvis du har en bedriftsprofil hos Google. Profilen er gratis, og du lager den selv hos Google.",
      "Profilen gjelder bedrifter som møter kundene sine, i et lokale eller hjemme hos kunden. Selger du bare på nett, kan du ikke ha profil.",
    ],
    steps: [
      "Sjekk først at navn, adresse, telefon og åpningstider er riktige under «Innstillinger» og «Firma og kontakt» her i studioet. Skriv dem helt likt hos Google, så Google ser at det er samme bedrift.",
      "Gå til business.google.com og logg inn med Google-kontoen bedriften skal eie profilen med. Bruk gjerne en konto som tilhører bedriften, ikke en ansatt.",
      "Søk opp bedriftsnavnet. Finnes bedriften allerede, gjør du krav på den. Ellers lager du en ny.",
      "Velg kategori, for eksempel «Frisør» eller «Rørlegger». Den første kategorien betyr mest.",
      "Har du et lokale kundene kommer til, skriv adressen. Kjører du ut til kundene, velg at du ikke har lokale, og skriv stedene du dekker.",
      "Skriv adressen til nettstedet ditt i feltet for nettsted.",
      "Bekreft bedriften. Google bestemmer hvordan: video av lokalet eller bilen, telefon, e-post eller brev i posten. Følg det Google ber om.",
      "Legg inn åpningstider og noen gode bilder, gjerne av lokalet, arbeidet ditt og deg selv.",
    ],
    notes: [
      "Det kan ta noen dager før profilen vises etter at den er bekreftet.",
      "Når profilen er bekreftet, finner du en lenke for å be om anmeldelser. Send den til fornøyde kunder. Gi aldri rabatt eller gaver mot anmeldelser, det bryter Googles regler.",
      "Endrer du åpningstider, gjør det både her og hos Google.",
      "Videobekreftelsen er ofte det tyngste steget. Ta opp skilt, lokale eller firmabil, og vis at du har tilgang til noe bare eieren har, for eksempel nøkler eller utstyr.",
    ],
    related: ["seo", "domene"],
  },
  {
    slug: "omdirigeringer",
    title: "Flytt fra en gammel nettside",
    category: "synlighet",
    summary: "Send gamle adresser videre til de nye, så du ikke mister plasseringen i Google.",
    steps: [
      "Gå til «Innstillinger» og «Flytt fra gammel side».",
      "Skriv adressen til den gamle sitemapen, ofte gammelside.no/sitemap.xml, eller last opp filen.",
      "Se over forslagene. Studioet foreslår hvilken ny side hver gamle adresse skal til.",
      "Lagre. Du kan også skrive omdirigeringer selv, én per linje: gammel adresse, mellomrom, ny adresse.",
    ],
    notes: [
      "Hele adresser fra den gamle nettsiden går fint, for eksempel https://gammelside.no/?page_id=12 /tjenester.",
      "Ingenting lagres før du har sett over og trykket lagre.",
      "Bare eieren kan endre omdirigeringer.",
    ],
    related: ["domene", "seo"],
  },
  {
    slug: "statistikk",
    title: "Slik leser du statistikken",
    category: "synlighet",
    summary: "Besøkende, sidevisninger og hvor de kommer fra, uten informasjonskapsler.",
    intro: ["Statistikken teller besøk uten informasjonskapsler, og ingen kan se hvem som har vært innom."],
    steps: [
      "Gå til «Statistikk».",
      "Velg periode øverst.",
      "Se besøkende, sidevisninger, mest besøkte sider og hvor besøkene kommer fra.",
    ],
    notes: [
      "En besøkende telles én gang per dag. Kommer samme person tilbake en annen dag, telles den på nytt.",
      "Besøk telles bare på publiserte sider på den vanlige adressen. Det du ser i studioet, telles ikke.",
      "Søkemotorer og andre roboter holdes utenfor så godt det lar seg gjøre.",
    ],
  },

  // Skjema, booking og nyhetsbrev
  {
    slug: "henvendelser",
    title: "Henvendelser fra kontaktskjemaet",
    category: "kunder",
    summary: "Meldinger fra skjemaet havner i studioet, og du kan få varsel på e-post.",
    steps: [
      "Gå til «Henvendelser». Nye meldinger er merket med rød kant.",
      "Trykk på e-postadressen i meldingen for å svare.",
      "Trykk «Merk som lest», og «Slett» når saken er ferdig.",
    ],
    notes: [
      "Hvem som får varsel på e-post, velger eieren under «Innstillinger» og «Varsler på e-post».",
      "Henvendelser er personopplysninger. De slettes av seg selv etter tolv måneder.",
    ],
    related: ["skjemafelt"],
  },
  {
    slug: "booking",
    title: "Sett opp timebestilling",
    category: "kunder",
    summary: "Tjenester, ansatte og arbeidstider, så kundene kan bestille time selv.",
    steps: [
      "Gå til «Booking» og legg til tjenestene, med varighet og pris.",
      "Legg til de ansatte, eller deg selv, med tjenestene de tar og når de jobber.",
      "Legg inn ferie og andre unntak under «Unntak og ferie».",
      "Velg varsel, avbestillingsfrist og hvor langt fram kundene kan bestille under «Innstillinger» nederst.",
      "Legg seksjonen «Timebestilling» med utseendet «Egen booking» på en side, og publiser.",
    ],
    notes: [
      "Norske helligdager er stengt av seg selv. Velg «Åpent som vanlig» for å åpne en helligdag.",
      "Kunden får bekreftelse på e-post med lenke for å avbestille før fristen.",
      "Avbestiller du en time selv, får kunden beskjed på e-post.",
      "Bookinger slettes av seg selv tolv måneder etter timen.",
    ],
  },
  {
    slug: "nyhetsbrev",
    title: "Send nyhetsbrev",
    category: "kunder",
    summary: "Skriv, test og send nyhetsbrev til dem som har bekreftet påmeldingen.",
    steps: [
      "Legg seksjonen «Nyhetsbrev» på en side, så folk kan melde seg på.",
      "Gå til «Nyhetsbrev» og skriv emne og forhåndsvisningstekst.",
      "Bygg e-posten med overskrift, tekst, bilde og knapp med lenke.",
      "Trykk «Send testutgave til meg» og sjekk e-posten.",
      "Trykk «Send til» og bekreft.",
    ],
    notes: [
      "Påmeldingen må bekreftes fra en lenke i e-post. Bare bekreftede får nyhetsbrev.",
      "Alle nyhetsbrev har avmeldingslenke. De som melder seg av, blir stående som avmeldt, så de aldri får nyhetsbrev igjen ved en feil.",
      "Et nyhetsbrev som er sendt, kan ikke hentes tilbake.",
      "Abonnentlisten kan lastes ned som CSV under «Abonnenter».",
    ],
  },

  // Nettbutikk
  {
    slug: "varer",
    title: "Legg inn varer",
    category: "nettbutikk",
    summary: "Én og én vare i studioet, eller mange på en gang fra regneark.",
    steps: [
      "Gå til «Varer» og trykk «Ny vare».",
      "Skriv navn, beskrivelse, pris og lager, og legg inn bilder.",
      "Har varen størrelser eller farger, legg til valg. Hver kombinasjon får egen pris og eget lager.",
      "Sett status til «I butikken» når varen skal vises.",
    ],
    notes: [
      "«Kladd» vises ikke i butikken. «Arkivert» er tatt ut av salg, men står i ordrene.",
      "Under «Pris og lager» endrer du mange varer på en gang.",
      "«Importer CSV» tar inn varer fra et regneark. Du ser alt som vil skje før noe lagres.",
      "Sett vekten på varen hvis du bruker Bring. Fraktprisen regnes ut fra vekten.",
    ],
    related: ["bring", "rabatter"],
  },
  {
    slug: "vipps-klarna",
    title: "Ta betalt med Vipps, Klarna og Kustom",
    category: "nettbutikk",
    summary: "Du har egen avtale, og pengene går rett til kontoen din.",
    intro: ["Du trenger en avtale med Vipps MobilePay om Vipps på nett, med Klarna eller med Kustom. Pengene går rett til butikken, aldri via Nettgata."],
    steps: [
      "Gå til «Betaling».",
      "Under Vipps: hent client_id, client_secret, abonnementsnøkkelen og salgsstednummeret (MSN) i portal.vippsmobilepay.com.",
      "Under Klarna: lag en API-nøkkel i Klarna Merchant Portal og lim inn brukernavn og passord med en gang. Klarna viser passordet bare én gang.",
      "Under Kustom: logg inn i Kustom Portal, gå til API-innstillingene og trykk «Generate new». Lim inn API-brukernavnet og API-passordet med en gang. Kustom viser passordet bare én gang.",
      "Trykk «Lagre og test tilkoblingen». Betalingsmåten vises i kassen først når testen har lykkes.",
    ],
    notes: [
      "«Hvor finner jeg nøklene?» på siden viser stegene for hver av dem.",
      "Beløpet reserveres når kunden betaler, og trekkes når du markerer ordren som sendt eller hentet.",
      "Betaling ved henting og faktura velger du nederst på samme side, under «Innstillinger» og «Betaling».",
      "Bare eieren kan legge inn nøklene.",
      "Vil du prøve først, lag testnøkler i Kustom playground og velg Test. Da trekkes ingen ekte penger.",
      "Kustom er en hel kasse der kunden velger betalingsmåte inne i Kustom. Den vises som et eget valg ved siden av Vipps og Klarna.",
    ],
    related: ["ordre"],
  },
  {
    slug: "ordre",
    title: "Fra ordre til pakke: sende, trekke og refundere",
    category: "nettbutikk",
    summary: "Hva statusene betyr, og når pengene trekkes.",
    steps: [
      "Gå til «Ordre». Ordre som er «Betalt, klar til sending» venter på deg.",
      "Pakk varene. Plukkliste og pakkseddel finner du fra ordren og ordrelisten.",
      "Trykk «Marker som sendt». Med Vipps, Klarna og Kustom trekkes beløpet nå, og kunden får e-post om at pakken er på vei.",
      "Skal kunden ha pengene tilbake, trykk «Refunder».",
    ],
    notes: [
      "Fullfører ikke kunden betalingen, kanselleres ordren av seg selv, og varene legges tilbake på lager.",
      "Kansellerer du en betalt ordre før den er sendt, frigjøres reservasjonen.",
      "Under «E-post» på ordren ser du hvilke e-poster som er sendt til kunden.",
      "Ordrelisten kan lastes ned som CSV.",
    ],
    related: ["ordrebekreftelse", "bring"],
  },
  {
    slug: "bring",
    title: "Frakt med Bring",
    category: "nettbutikk",
    summary: "Fraktpris fra Bring i kassen og fraktetikett fra ordren.",
    steps: [
      "Gå til «Innstillinger» og «Frakt og levering», og finn «Frakt med Bring».",
      "Legg inn opplysningene fra Mybring-kontoen din. «Hvor finner jeg dette i Mybring?» viser hvor.",
      "Test tilkoblingen, og velg hvilke fraktvalg kassen skal vise.",
      "Sett vekten på varene under «Varer».",
    ],
    notes: [
      "Kassen henter prisen fra Bring ut fra vekten og postnummeret til kunden.",
      "Fra ordren lager du fraktetiketten med ett trykk, og sporingsnummeret legges inn av seg selv.",
      "Etikettene er A6 og passer en termoskriver.",
      "Bare eieren kan endre Bring-oppsettet.",
    ],
    related: ["ordre", "varer"],
  },
  {
    slug: "rabatter",
    title: "Rabattkoder",
    category: "nettbutikk",
    summary: "Prosent, fast beløp eller fri frakt, med eller uten tidsrom og grense.",
    steps: [
      "Gå til «Rabatter».",
      "Skriv koden kunden skal skrive i kassen.",
      "Velg prosent, beløp eller fri frakt.",
      "Sett gjerne minstebeløp, datoer og hvor mange ganger koden kan brukes.",
      "Lagre.",
    ],
  },

  // Abonnement og konto
  {
    slug: "abonnement",
    title: "Velg abonnement og betal",
    category: "konto",
    summary: "Abonnementet betales med kort hos Stripe, månedlig eller årlig.",
    steps: [
      "Gå til «Abonnement».",
      "Velg månedlig eller årlig betaling, og tillegg hvis du vil ha det.",
      "Trykk «Gå til betaling». Betalingen skjer hos Stripe.",
      "Når betalingen er gjennomført, kommer du tilbake til studioet, og abonnementet er aktivt.",
    ],
    notes: [
      "Med aktivt abonnement kan du publisere og koble til eget domene.",
      "Bare eieren kan endre abonnementet.",
    ],
    related: ["bytt-kort", "si-opp"],
  },
  {
    slug: "bytt-kort",
    title: "Hvordan bytter jeg kort?",
    category: "konto",
    summary: "Kort og fakturaer håndteres på Stripe sin side.",
    steps: [
      "Gå til «Abonnement».",
      "Trykk «Bytt kort, se fakturaer eller si opp».",
      "Legg inn det nye kortet hos Stripe.",
      "Trykk tilbake-lenken for å komme tilbake til studioet.",
    ],
    notes: [
      "Står det «Betalingen feilet» eller «Ikke betalt», oppdaterer du kortet på samme måte. Stripe prøver da igjen.",
      "Der finner du også alle fakturaene.",
    ],
    related: ["si-opp"],
  },
  {
    slug: "si-opp",
    title: "Hvordan sier jeg opp?",
    category: "konto",
    summary: "Si opp hos Stripe. Abonnementet varer ut perioden du har betalt for.",
    steps: [
      "Gå til «Abonnement».",
      "Trykk «Bytt kort, se fakturaer eller si opp».",
      "Velg å si opp abonnementet hos Stripe.",
      "Tilbake i studioet står det «Sagt opp» og hvilken dato abonnementet varer til.",
    ],
    notes: [
      "Last ned alt før perioden er ute. Under «Innstillinger» og «Last ned alt» får du sidene, bildene og alle dataene dine i én fil.",
      "Domenet står i ditt navn, så du tar det med deg.",
    ],
    related: ["last-ned-alt"],
  },
  {
    slug: "tofaktor",
    title: "Tofaktorinnlogging",
    category: "konto",
    summary: "Passord pluss en kode fra telefonen, så ingen kommer inn med bare passordet.",
    steps: [
      "Gå til «Konto» øverst i studioet.",
      "Åpne en kodeapp, for eksempel Google Authenticator eller Microsoft Authenticator, og skann QR-koden.",
      "Skriv inn den sekssifrede koden appen viser.",
      "Ta vare på reservekodene, for eksempel i en passordbehandler.",
    ],
    notes: [
      "Hver reservekode virker én gang. Har du mistet telefonen, logger du inn med en av dem.",
      "Har du mistet både telefonen og reservekodene, send oss en melding.",
    ],
  },
  {
    slug: "last-ned-alt",
    title: "Last ned alt (eksport)",
    category: "konto",
    summary: "Én ZIP-fil med nettstedet, bildene og alle dataene dine. Du kan alltid ta med deg alt.",
    intro: ["Det du har laget, er ditt. «Last ned alt» gir deg en kopi du kan åpne på egen maskin eller legge ut et annet sted."],
    steps: [
      "Gå til «Innstillinger» og «Last ned alt».",
      "Trykk «Lag ZIP-fil». Filen lages i bakgrunnen.",
      "Du får e-post når den er klar. Store nettsteder kan ta litt tid.",
      "Last ned filen fra lenken i e-posten eller fra «Innstillinger». Lenken virker i sju dager.",
    ],
    notes: [
      "I filen ligger de publiserte sidene som HTML med CSS og bilder, alt innholdet som JSON, bildene og filene i original størrelse, og varer, ordre, kunder, henvendelser, abonnenter og bookinger som CSV.",
      "LES-MEG.txt i filen forklarer hva som ligger hvor.",
      "Filen har personopplysninger om kundene dine. Lagre den trygt, og slett den når du ikke trenger den.",
      "Bare eieren kan laste ned alt. Du kan lage tre filer per døgn.",
    ],
    related: ["si-opp"],
  },
  {
    slug: "ai-teamet",
    title: "AI-teamet",
    category: "konto",
    summary: "Forslag til tekst, titler, blogginnlegg og innlegg til sosiale medier, som du godkjenner selv.",
    steps: [
      "Legg til AI-teamet under «Abonnement».",
      "Nye forslag kommer i løpet av natten under «AI-teamet».",
      "Les forslaget og trykk «Godkjenn» hvis du vil bruke det. Det havner i kladden.",
      "Se over siden og publiser selv.",
    ],
    notes: ["Ingenting endres på nettstedet før du har godkjent og publisert."],
    related: ["publisere"],
  },

  // Vanlige problemer
  {
    slug: "domenet-virker-ikke",
    title: "Domenet virker ikke ennå",
    category: "problemer",
    summary: "Det står «Venter på DNS», eller domenet viser feil side.",
    steps: [
      "Gå til «Innstillinger» og «Domene», og trykk «Vis DNS-pekerne».",
      "Sammenlign med det som står hos domeneforhandleren. Type, navn og verdi må være helt like.",
      "Slett gamle pekere for www og for domenet uten www, hvis de finnes.",
      "Vent en stund og trykk «Sjekk nå». Endringer i DNS tar vanligvis fra noen minutter til noen timer.",
    ],
    notes: [
      "Står det «Peker ikke hit lenger», er pekerne endret eller slettet hos forhandleren. Legg dem inn igjen.",
      "Finner du ikke ANAME eller ALIAS for domenet uten www, sett opp videresending til www i stedet.",
      "Står du fast, send oss et skjermbilde av DNS-siden hos forhandleren.",
    ],
    related: ["domene"],
  },
  {
    slug: "ordrebekreftelse",
    title: "Kunden fikk ikke ordrebekreftelsen",
    category: "problemer",
    summary: "Sjekk e-posten på ordren, adressen kunden skrev og søppelposten.",
    steps: [
      "Åpne ordren under «Ordre» og se under «E-post». Der står det om ordrebekreftelsen er sendt, og til hvilken adresse.",
      "Sjekk at e-postadressen er riktig. En skrivefeil er den vanligste grunnen.",
      "Be kunden se i søppelpost og i fanene for kampanjer.",
      "Står det «Feilet», send kunden ordrenummeret og innholdet selv fra din egen e-post.",
    ],
    notes: [
      "Med Vipps og Klarna sendes bekreftelsen først når betalingen er bekreftet. Står ordren på «Venter på betaling», er den ikke sendt ennå.",
      "Svar fra kunden på bekreftelsen går til e-postadressen til butikken.",
    ],
    related: ["ordre"],
  },
  {
    slug: "kan-ikke-publisere",
    title: "Jeg får ikke publisert",
    category: "problemer",
    summary: "Knappen sier «Velg abonnement for å publisere», eller publiseringen stopper.",
    steps: [
      "Står det «Velg abonnement for å publisere», er ikke abonnementet betalt ennå. Gå til «Abonnement».",
      "Les meldingen som kommer når du trykker «Publiser». Den sier hva som mangler, for eksempel et bilde som er slettet.",
      "Står det «Ikke lagret» øverst i redigereren, trykk «Prøv igjen» før du publiserer.",
    ],
    notes: ["Sider som alt er publisert, blir liggende ute selv om abonnementet stopper."],
    related: ["publisere", "abonnement"],
  },
];

const bySlug = new Map(helpArticles.map((a) => [a.slug, a]));

export function getHelpArticle(slug: string): HelpArticle | null {
  return bySlug.get(slug) ?? null;
}

export function helpHref(slug: string): string {
  return `/studio/hjelp/${slug}`;
}

/** All teksten i en artikkel, til søk og til testen som leter etter tankestreker. */
export function articleText(article: HelpArticle): string {
  return [article.title, article.summary, ...(article.intro ?? []), ...(article.steps ?? []), ...(article.notes ?? [])].join("\n");
}

/** Små bokstaver, uten aksenter (é blir e), men æ, ø og å beholdes. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[«»"'.,:;!?()/]/g, " ")
    .normalize("NFD")
    .replace(/[̀-̉̋-ͯ]/g, "")
    .normalize("NFC");
}

const words = (text: string) => normalize(text).split(/\s+/).filter(Boolean);

/**
 * Søk i tittel, sammendrag og tekst. Alle ordene i søket må finnes, og et ord treffer starten av et ord i teksten,
 * så «domen» finner «domenet». Treff i tittelen teller mest. Tomt søk gir alle artiklene i vanlig rekkefølge.
 */
export function searchHelp(query: string, articles: HelpArticle[] = helpArticles): HelpArticle[] {
  const terms = words(query);
  if (terms.length === 0) return articles;
  const scored: { article: HelpArticle; score: number; index: number }[] = [];
  articles.forEach((article, index) => {
    const title = words(article.title);
    const summary = words(article.summary);
    const body = words(articleText(article));
    let score = 0;
    for (const term of terms) {
      const hit = (list: string[]) => list.some((w) => w.startsWith(term));
      if (hit(title)) score += 5;
      else if (hit(summary)) score += 3;
      else if (hit(body)) score += 1;
      else return;
    }
    scored.push({ article, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.article);
}
