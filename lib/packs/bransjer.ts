import { servicePack, type Profile } from "./factory";

/**
 * Bransjepakkene for tjenestebedrifter. Hver sjanger har en felles grunnmur (fordeler, spørsmål, tekst om
 * bedriften), og hver bransje har egne tjenester, priser og toppbilde. Prisene står som «Skriv pris», så
 * ingen publiserer en pris de ikke har satt selv.
 */

type Base = Omit<Profile, "key" | "label" | "description" | "schemaType" | "hero" | "services" | "prices"> & {
  prices: Omit<Profile["prices"], "items">;
};
type Own = Pick<Profile, "key" | "label" | "description" | "schemaType" | "hero" | "services"> &
  Partial<Pick<Profile, "themes" | "benefits" | "gallery" | "cta" | "faq" | "local">> & {
    prices: Profile["prices"]["items"];
    pricePage?: Partial<Profile["prices"]>;
  };

const SKRIV = "Skriv pris";

function make(base: Base, own: Own): Profile {
  const { prices, pricePage, ...rest } = own;
  return { ...base, ...rest, prices: { ...base.prices, ...pricePage, items: prices } };
}

// Håndverk og bygg
const handverk: Base = {
  themes: ["verksted", "fjord", "kontor"],
  benefits: [
    ["Fast pris før vi starter", "Du får et skriftlig tilbud, ikke en overraskelse på fakturaen"],
    ["Godkjent og forsikret", "Skriv hvilke godkjenninger dere har"],
    ["Vi rydder etter oss", "Du skal bare merke resultatet"],
  ],
  prices: { path: "/tjenester", title: "Tjenester og priser", heading: "Tjenester og priser" },
  about: {
    text: "Skriv kort hvem dere er, hvor lenge dere har holdt på og hvilke områder dere dekker. Folk vil vite hvem som kommer hjem til dem, så et bilde av deg eller gjengen gjør mye.",
    image: "Bilde av deg eller gjengen på jobb",
  },
  faq: [
    ["Hva koster en befaring?", "Skriv om befaringen er gratis, og hva som skjer etterpå."],
    ["Hvor fort kan dere komme?", "Skriv vanlig ventetid, og om dere tar akutte oppdrag."],
    ["Tar dere små jobber?", "Skriv om dere har en minstepris, eller om dere tar alt fra små reparasjoner til store prosjekter."],
  ],
  cta: { heading: "Klar for et tilbud?", text: "Fortell kort hva du trenger, gjerne med et bilde, så svarer vi innen én virkedag.", button: "Be om tilbud" },
  contact: {
    text: "Beskriv jobben kort, og skriv gjerne adressen. Vi svarer innen én virkedag.",
    fields: [
      { etikett: "Adressen der jobben skal gjøres", felttype: "tekst", pakrevd: "nei" },
      { etikett: "Når passer det å starte?", felttype: "dato", pakrevd: "nei" },
      // Skjemaet viser selv «(valgfritt)» etter navnet.
      { etikett: "Bilder av jobben", felttype: "bilder", pakrevd: "nei" },
    ],
  },
  local: { team: "Folkene som kommer hjem til deg" },
};

const rorlegger = make(handverk, {
  key: "rorlegger",
  label: "Rørlegger",
  description: "Bad, varmtvann, lekkasjer og akutthjelp.",
  schemaType: "Plumber",
  hero: {
    title: (c) => `Rørlegger${c.area} som holder avtalen`,
    text: "Nytt bad, ny varmtvannsbereder eller en lekkasje som må fikses i dag. Du får fast pris før vi starter.",
    button: "Be om tilbud",
    image: "Bilde av et ferdig bad eller av deg på jobb",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Bad og våtrom", "Fra nye rør til ferdig bad, med dokumentasjon på alt."],
      ["Varmtvannsbereder", "Bytte og montering, også når den gamle har begynt å lekke."],
      ["Lekkasjer og akutthjelp", "Vi finner feilen og stopper vannet, også utenom vanlig arbeidstid."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på jobben og gir deg en fast pris.", SKRIV],
    ["Bytte av varmtvannsbereder", "Inkludert montering og bortkjøring av den gamle.", SKRIV],
    ["Timepris", "For mindre jobber og service.", SKRIV],
    ["Utrykning utenom arbeidstid", "Kvelder, helger og helligdager.", SKRIV],
  ],
});

const elektriker = make(handverk, {
  key: "elektriker",
  label: "Elektriker",
  description: "Elbillader, sikringsskap, smarthus og feilsøking.",
  schemaType: "Electrician",
  hero: {
    title: (c) => `Autorisert elektriker${c.area}`,
    text: "Elbillader, nytt sikringsskap eller lys som endelig sitter der du vil ha det. Du får samsvarserklæring på alt vi gjør.",
    button: "Be om tilbud",
    image: "Bilde av deg på jobb eller av et ferdig anlegg",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Elbillader", "Montering av lader hjemme eller på jobben, med riktig sikring."],
      ["Sikringsskap", "Oppgradering til moderne skap med jordfeilbryter."],
      ["Feilsøking", "Strøm som går, lys som blinker eller stikk som ikke virker."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på anlegget og gir deg en fast pris.", SKRIV],
    ["Montering av elbillader", "Lader, kabel og sikring.", SKRIV],
    ["Timepris", "For mindre jobber og feilsøking.", SKRIV],
  ],
});

const snekker = make(handverk, {
  key: "snekker",
  label: "Snekker og tømrer",
  description: "Terrasse, tilbygg, kjøkken, vinduer og rehabilitering.",
  schemaType: "GeneralContractor",
  hero: {
    title: (c) => `Snekker og tømrer${c.area}`,
    text: "Terrasse, tilbygg, nytt kjøkken eller vinduer som må byttes. Vi tar jobben fra tegning til ferdig resultat.",
    button: "Be om tilbud",
    image: "Bilde av en terrasse, et tilbygg eller annet dere har bygget",
  },
  services: {
    heading: "Dette bygger vi",
    items: [
      ["Terrasse og uteplass", "Planlegging og bygging, med materialer som tåler norsk vær."],
      ["Tilbygg og påbygg", "Mer plass uten å flytte. Vi hjelper deg med søknaden."],
      ["Kjøkken, vinduer og dører", "Montering og tilpasning, med lister og alt."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på jobben og gir deg en fast pris.", SKRIV],
    ["Timepris", "For mindre jobber.", SKRIV],
    ["Fastpris på prosjekt", "Etter befaring.", ""],
  ],
});

const maler = make(handverk, {
  key: "maler",
  label: "Maler",
  description: "Innvendig, fasade, beis og tapet.",
  schemaType: "HousePainter",
  hero: {
    title: (c) => `Maler${c.area}`,
    text: "Innvendig, utvendig eller den ene veggen som har plaget deg lenge. Vi dekker til, rydder og holder avtalt tid.",
    button: "Be om tilbud",
    image: "Bilde av et rom eller en fasade dere har malt",
  },
  services: {
    heading: "Dette maler vi",
    items: [
      ["Innvendig maling", "Vegger, tak og listverk, med sparkling der det trengs."],
      ["Fasade og beis", "Vask, skraping og maling som holder i mange år."],
      ["Tapet", "Alt fra en fondvegg til hele huset."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på jobben og gir deg en fast pris.", SKRIV],
    ["Maling av rom", "Pris etter størrelse.", SKRIV],
    ["Timepris", "", SKRIV],
  ],
});

const taktekker = make(handverk, {
  key: "taktekker",
  label: "Taktekker",
  description: "Nytt tak, lekkasjer, takrenner og beslag.",
  schemaType: "RoofingContractor",
  hero: {
    title: (c) => `Taktekker${c.area}`,
    text: "Nytt tak, lekkasje eller takrenner som har gitt opp. Vi gjør jobben trygt, med stillas og forsikring i orden.",
    button: "Be om tilbud",
    image: "Bilde av et tak dere har lagt",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Nytt tak", "Takstein, shingel eller stål. Vi hjelper deg å velge."],
      ["Lekkasjer og reparasjon", "Vi finner hvor vannet kommer inn og tetter det."],
      ["Takrenner og beslag", "Montering og utskifting, også på gamle hus."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på taket og gir deg en fast pris.", SKRIV],
    ["Timepris", "", SKRIV],
  ],
});

const anlegg = make(handverk, {
  key: "anlegg",
  label: "Anleggsgartner og graving",
  description: "Belegningsstein, drenering, graving, hage og plen.",
  schemaType: "HomeAndConstructionBusiness",
  hero: {
    title: (c) => `Anleggsgartner og graving${c.area}`,
    text: "Belegningsstein, drenering, ny plen eller en tomt som skal gjøres klar. Vi har maskinene og folkene.",
    button: "Be om tilbud",
    image: "Bilde av en innkjørsel, hage eller tomt dere har gjort",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Belegningsstein og murer", "Innkjørsel, uteplass og støttemurer som står støtt."],
      ["Graving og drenering", "Tomt, grøfter og drenering rundt huset."],
      ["Hage og plen", "Planting, ferdigplen og stell gjennom sesongen."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på jobben og gir deg en fast pris.", SKRIV],
    ["Gravemaskin med fører", "Per time.", SKRIV],
    ["Timepris", "", SKRIV],
  ],
});

// Skjønnhet og velvære
const skjonnhet: Base = {
  themes: ["atelier", "nordlys", "boutique", "klinikk"],
  benefits: [
    ["Bestill når det passer deg", "Skriv hvordan kundene bestiller time"],
    ["Produkter vi står for", "Skriv hvilke merker dere bruker og selger"],
    ["God tid til deg", "Ingen samlebånd, bare godt håndverk"],
  ],
  prices: { path: "/priser", title: "Priser", heading: "Behandlinger og priser" },
  about: {
    text: "Fortell hvem som jobber her, hva dere er gode på og hva kundene kan forvente. Et bilde av lokalet og av dere gjør det lettere å bestille første gang.",
    image: "Bilde av lokalet eller av dere som jobber der",
  },
  gallery: { heading: "Fra stolen vår", image: "Bilde av en frisyre eller behandling dere har gjort", page: { path: "/galleri", title: "Galleri" } },
  faq: [
    ["Hvordan bestiller jeg time?", "Skriv om kundene bestiller på nett, på telefon eller begge deler."],
    ["Hva hvis jeg må avbestille?", "Skriv fristen for avbestilling og hva som skjer om noen ikke møter."],
    ["Kan jeg kjøpe gavekort?", "Skriv om dere selger gavekort, og hvordan."],
  ],
  cta: { heading: "Klar for en ny time?", text: "Bestill time, eller send oss et spørsmål hvis du er usikker på hva du trenger.", button: "Bestill time" },
  contact: { text: "Spørsmål om en behandling eller en time? Skriv til oss, så svarer vi så fort vi kan." },
  local: { team: "Hvem du møter hos oss", hours: true, map: true },
};

const frisor = make(skjonnhet, {
  key: "frisor",
  label: "Frisør",
  description: "Klipp, farge, styling og barbering.",
  schemaType: "HairSalon",
  hero: {
    title: (c) => `Frisør${c.area} med god tid til deg`,
    text: "Klipp, farge og styling hos folk som lytter før de klipper. Bestill time når det passer deg.",
    button: "Bestill time",
    image: "Bilde fra salongen eller av en frisyre dere har gjort",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Klipp", "Dame, herre og barn. Vi tar en prat før saksa kommer frem."],
      ["Farge og striper", "Fra en liten oppfriskning til en helt ny farge."],
      ["Styling og oppsett", "Til bryllup, ball og andre store dager."],
    ],
  },
  prices: [
    ["Dameklipp", "Inkludert vask og føn.", SKRIV],
    ["Herreklipp", "", SKRIV],
    ["Barneklipp", "Til og med 12 år.", SKRIV],
    ["Farge", "Pris etter hårlengde.", SKRIV],
    ["Striper", "Pris etter hårlengde.", SKRIV],
    ["Oppsett", "Vi anbefaler en prøvetime før store dager.", SKRIV],
  ],
});

const hudpleie = make(skjonnhet, {
  key: "hudpleie",
  label: "Hudpleie, vipper og negler",
  description: "Ansiktsbehandling, vipper, bryn, manikyr og pedikyr.",
  schemaType: "BeautySalon",
  hero: {
    title: (c) => `Hudpleie og skjønnhet${c.area}`,
    text: "Ansiktsbehandlinger, vipper, bryn og negler. Du får god tid, og vi forteller alltid hva vi gjør og hvorfor.",
    button: "Bestill time",
    image: "Bilde fra behandlingsrommet",
  },
  services: {
    heading: "Behandlinger",
    items: [
      ["Ansiktsbehandling", "Tilpasset huden din, med råd du kan bruke hjemme."],
      ["Vipper og bryn", "Farging, løft og forming."],
      ["Negler", "Manikyr, pedikyr og gelé."],
    ],
  },
  prices: [
    ["Ansiktsbehandling, 60 min", "", SKRIV],
    ["Vippeløft", "", SKRIV],
    ["Farging av vipper og bryn", "", SKRIV],
    ["Manikyr", "", SKRIV],
    ["Pedikyr", "", SKRIV],
  ],
});

const massasje = make(skjonnhet, {
  key: "massasje",
  label: "Massasje og spa",
  description: "Massasje, behandlinger og gavekort.",
  schemaType: "DaySpa",
  gallery: undefined,
  hero: {
    title: (c) => `Massasje og velvære${c.area}`,
    text: "Klassisk massasje, behandling for sliten rygg eller bare en time der ingen vil deg noe.",
    button: "Bestill time",
    image: "Bilde fra behandlingsrommet",
  },
  services: {
    heading: "Behandlinger",
    items: [
      ["Klassisk massasje", "30, 60 eller 90 minutter."],
      ["Idrettsmassasje", "For deg som trener mye eller har vondt etter en skade."],
      ["Gavekort", "En gave folk faktisk bruker."],
    ],
  },
  prices: [
    ["Massasje, 30 min", "", SKRIV],
    ["Massasje, 60 min", "", SKRIV],
    ["Massasje, 90 min", "", SKRIV],
    ["Gavekort", "Du velger beløpet selv.", ""],
  ],
});

// Helse og behandling
const helse: Base = {
  themes: ["klinikk", "fjord", "kontor"],
  benefits: [
    ["Enkel timebestilling", "Skriv hvordan pasientene bestiller time"],
    ["Kort ventetid", "Skriv hvor fort nye pasienter vanligvis får time"],
    ["God tid", "Første time handler om å forstå hva du trenger"],
  ],
  prices: { path: "/behandlinger", title: "Behandlinger", heading: "Behandlinger og priser" },
  about: {
    text: "Fortell hvem som jobber her, hvilken utdanning og autorisasjon dere har, og hva dere er spesielt gode på. Pasienter vil vite hvem de møter.",
    image: "Bilde av dere eller av klinikken",
  },
  faq: [
    ["Trenger jeg henvisning?", "Skriv om pasienten trenger henvisning, og om det påvirker prisen."],
    ["Hva skjer på første time?", "Beskriv kort hvordan en første time foregår."],
    ["Hva hvis jeg må avbestille?", "Skriv fristen for avbestilling og hva det koster å ikke møte."],
  ],
  cta: { heading: "Bestill time", text: "Ta kontakt, så finner vi en tid som passer. Er du usikker på om vi kan hjelpe, spør oss først.", button: "Bestill time" },
  // Kontaktskjemaet er ikke laget for helseopplysninger. Det står derfor rett over skjemaet.
  contact: { text: "Ikke send helseopplysninger her. Skriv kort hva det gjelder og hvordan vi når deg, så tar vi kontakt." },
  local: { team: "Hvem du møter hos oss", hours: true, map: true },
};

const fysioterapeut = make(helse, {
  key: "fysioterapeut",
  label: "Fysioterapeut",
  description: "Undersøkelse, behandling og opptrening.",
  schemaType: "Physiotherapy",
  hero: {
    title: (c) => `Fysioterapi${c.area}`,
    text: "Vondt i ryggen, nakken eller et kne som ikke vil? Vi finner årsaken og lager en plan du klarer å følge.",
    button: "Bestill time",
    image: "Bilde fra behandlingsrommet eller treningssalen",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Undersøkelse og behandling", "Vi finner ut hva som er galt, og behandler det."],
      ["Opptrening etter skade", "Trygg vei tilbake etter operasjon eller skade."],
      ["Trening i små grupper", "Sterkere og mindre vondt, sammen med andre."],
    ],
  },
  prices: [
    ["Første konsultasjon", "Undersøkelse og behandling, 45 min.", SKRIV],
    ["Oppfølgende behandling", "30 min.", SKRIV],
    ["Gruppetrening", "Per gang.", SKRIV],
  ],
});

const kiropraktor = make(helse, {
  key: "kiropraktor",
  label: "Kiropraktor og naprapat",
  description: "Plager i rygg, nakke og ledd.",
  schemaType: "MedicalClinic",
  hero: {
    title: (c) => `Kiropraktor${c.area}`,
    text: "Vi undersøker og behandler plager i rygg, nakke og ledd. De fleste merker forskjell etter få behandlinger.",
    button: "Bestill time",
    image: "Bilde fra klinikken",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Rygg og nakke", "Akutte og langvarige plager."],
      ["Hodepine og svimmelhet", "Når årsaken sitter i nakken."],
      ["Idrettsskader", "Behandling og råd om trening."],
    ],
  },
  prices: [
    ["Førstegangskonsultasjon", "Undersøkelse og behandling.", SKRIV],
    ["Behandling", "", SKRIV],
  ],
});

const psykolog = make(helse, {
  key: "psykolog",
  label: "Psykolog og terapeut",
  description: "Samtaler, terapi og parterapi.",
  schemaType: "MedicalClinic",
  hero: {
    title: (c) => `Psykolog og samtaleterapi${c.area}`,
    text: "Et trygt sted å snakke om det som er vanskelig. Vi tilbyr samtaler på kontoret og på video.",
    button: "Bestill time",
    image: "Bilde av samtalerommet",
  },
  services: {
    heading: "Dette tilbyr vi",
    items: [
      ["Individuell terapi", "For angst, depresjon, stress og livskriser."],
      ["Parterapi", "Når dere står fast og vil finne tilbake til hverandre."],
      ["Samtaler på video", "Like trygt, fra der du er."],
    ],
  },
  prices: [
    ["Første samtale", "Vi blir kjent og ser på hva du trenger.", SKRIV],
    ["Samtale, 45 min", "", SKRIV],
    ["Parterapi, 60 min", "", SKRIV],
  ],
});

const tannlege = make(helse, {
  key: "tannlege",
  label: "Tannlege",
  description: "Undersøkelse, tannrens, fyllinger og akutthjelp.",
  schemaType: "Dentist",
  hero: {
    title: (c) => `Tannlege${c.area}`,
    text: "Vi tar godt vare på både tennene og deg. Også deg som gruer deg til å gå til tannlegen.",
    button: "Bestill time",
    image: "Bilde fra klinikken",
  },
  services: {
    heading: "Behandlinger",
    items: [
      ["Undersøkelse og rens", "Årlig sjekk, røntgen og tannrens."],
      ["Fyllinger og kroner", "Holdbare løsninger som ser naturlige ut."],
      ["Akutt hjelp", "Vi prøver alltid å finne en time samme dag."],
    ],
  },
  prices: [
    ["Undersøkelse", "Inkludert røntgen ved behov.", SKRIV],
    ["Tannrens", "", SKRIV],
    ["Fylling", "Pris etter størrelse.", SKRIV],
  ],
});

// Mat og drikke
const mat: Base = {
  themes: ["bistro", "hytte", "boutique", "nordlys"],
  benefits: [
    ["Laget fra bunnen av", "Skriv hva dere lager selv"],
    ["Lokale råvarer", "Skriv hvem dere handler fra"],
    ["Plass til selskap", "Skriv om dere tar imot større grupper"],
  ],
  prices: { path: "/meny", title: "Meny", heading: "Meny" },
  about: {
    text: "Fortell historien bak stedet: hvem dere er, hva dere er stolte av og hvorfor folk kommer tilbake. Bilder av lokalet og maten selger mer enn mange ord.",
    image: "Bilde av lokalet eller kjøkkenet",
  },
  gallery: { heading: "Fra kjøkkenet", image: "Bilde av mat dere har laget" },
  faq: [
    ["Må jeg bestille bord?", "Skriv om dere tar imot bestilling, og hvordan."],
    ["Tar dere hensyn til allergier?", "Skriv hvordan gjestene sier fra om allergier."],
    ["Kan vi leie lokalet?", "Skriv om dere tar selskaper og catering."],
  ],
  cta: { heading: "Velkommen innom", text: "Se åpningstidene og finn veien til oss, eller send en melding om du vil bestille bord.", button: "Kontakt oss" },
  contact: { text: "Vil du bestille bord, spørre om selskap eller catering? Skriv til oss." },
  local: { hours: true, map: true, menu: true },
};

const kafe = make(mat, {
  key: "kafe",
  label: "Kafé",
  description: "Kaffe, bakst og lunsj.",
  schemaType: "CafeOrCoffeeShop",
  hero: {
    title: (c) => `Kaffe, bakst og god tid${c.area}`,
    text: "Nybakt hver morgen, god kaffe og en plass ved vinduet. Stikk innom.",
    button: "Se menyen",
    link: "/meny",
    image: "Bilde fra kafeen",
  },
  services: {
    heading: "Dette serverer vi",
    items: [
      ["Kaffe", "Fra espresso til filter."],
      ["Bakst", "Boller, kanelsnurrer og brød, bakt her hver morgen."],
      ["Lunsj", "Supper, smørbrød og salater som skifter med sesongen."],
    ],
  },
  prices: [
    ["Kaffe", "", SKRIV],
    ["Cappuccino", "", SKRIV],
    ["Kanelsnurr", "", SKRIV],
    ["Dagens suppe", "Med hjemmebakt brød.", SKRIV],
    ["Smørbrød", "Spør om dagens utvalg.", SKRIV],
  ],
});

const restaurant = make(mat, {
  key: "restaurant",
  label: "Restaurant",
  description: "Middag, lunsj og selskap.",
  schemaType: "Restaurant",
  hero: {
    title: (c) => `Middag${c.area} som er verdt turen`,
    text: "Sesongens råvarer, en kort meny og et kjøkken som lager det meste selv. Bestill bord, eller kom innom.",
    button: "Bestill bord",
    image: "Bilde fra restauranten eller av en rett",
  },
  services: {
    heading: "Hos oss",
    items: [
      ["Middag", "En kort meny som skifter med sesongen."],
      ["Lunsj", "Raske retter i ukedagene."],
      ["Selskap", "Bursdag, jobbmiddag eller minnestund. Vi tilpasser menyen."],
    ],
  },
  prices: [
    ["Forrett", "Skriv hva retten består av.", SKRIV],
    ["Hovedrett", "Skriv hva retten består av.", SKRIV],
    ["Dessert", "Skriv hva retten består av.", SKRIV],
    ["Barnemeny", "", SKRIV],
  ],
});

const bakeri = make(mat, {
  key: "bakeri",
  label: "Bakeri og konditori",
  description: "Brød, bakst og kaker på bestilling.",
  schemaType: "Bakery",
  hero: {
    title: (c) => `Brød og kaker bakt her${c.area}`,
    text: "Surdeigsbrød, wienerbrød og kaker til alle anledninger. Bestill kaken din i god tid.",
    button: "Bestill kake",
    image: "Bilde av bakst fra disken",
  },
  services: {
    heading: "Fra bakeriet",
    items: [
      ["Brød", "Surdeig og grove brød, bakt hver morgen."],
      ["Kaker på bestilling", "Bursdag, dåp, bryllup og konfirmasjon."],
      ["Wienerbrød og boller", "Ferske fra ovnen, så lenge de varer."],
    ],
  },
  pricePage: { title: "Priser", path: "/priser", heading: "Utvalg og priser" },
  prices: [
    ["Surdeigsbrød", "", SKRIV],
    ["Bløtkake, 12 stykker", "Bestilles to dager før.", SKRIV],
    ["Kanelbolle", "", SKRIV],
  ],
});

const catering = make(mat, {
  key: "catering",
  // Catering har sjelden et lokale med faste tider. Menyen som PDF passer likevel.
  local: { menu: true },
  label: "Catering og matbil",
  description: "Selskapsmat, lunsj til møter og matbil.",
  schemaType: "FoodEstablishment",
  gallery: undefined,
  hero: {
    title: (c) => `Mat til selskap og arrangement${c.area}`,
    text: "Vi lager maten og kommer med den. Du får en meny som passer anledningen og antallet gjester.",
    button: "Be om tilbud",
    image: "Bilde av et bord dere har dekket",
  },
  services: {
    heading: "Vi lager",
    items: [
      ["Selskapsmat", "Koldtbord, varmretter og tapas."],
      ["Jobb og møter", "Lunsj levert på døra, til fast tid."],
      ["Matbil", "Vi kommer til festivalen, bryllupet eller jobbfesten."],
    ],
  },
  pricePage: { title: "Priser", path: "/priser", heading: "Priser" },
  prices: [
    ["Koldtbord", "Per person, minst 15 personer.", SKRIV],
    ["Lunsj til møter", "Per person.", SKRIV],
    ["Leie av matbil", "", SKRIV],
  ],
  cta: { heading: "Planlegger du et selskap?", text: "Fortell hva slags anledning det er, hvor mange dere blir og når, så får du forslag til meny og pris.", button: "Be om tilbud" },
});

// Rådgivning og kontor
const kontor: Base = {
  themes: ["kontor", "fjord", "nordlys", "galleri"],
  benefits: [
    ["Fast pris eller timepris", "Du vet hva det koster før vi starter"],
    ["Svar innen én virkedag", "Skriv hvor fort dere svarer nye henvendelser"],
    ["Én fast kontaktperson", "Du slipper å forklare alt på nytt"],
  ],
  prices: { path: "/tjenester", title: "Tjenester", heading: "Tjenester og priser" },
  about: {
    text: "Fortell hvem dere er, hvilken bakgrunn og hvilke godkjenninger dere har, og hvilke kunder dere jobber best med. Vis gjerne ansiktene, folk kjøper av folk.",
    image: "Portrett av deg eller av dere på kontoret",
  },
  faq: [
    ["Hva koster det?", "Skriv om dere har fast pris, timepris eller begge deler."],
    ["Jobber dere med kunder i hele landet?", "Skriv om dere møter kundene fysisk, på video eller begge deler."],
    ["Hvordan kommer vi i gang?", "Beskriv første møte og hva kunden bør ha klart."],
  ],
  cta: { heading: "La oss ta en prat", text: "Fortell kort hva du trenger hjelp med, så foreslår vi neste steg.", button: "Ta kontakt" },
  contact: { text: "Skriv kort hva det gjelder, så svarer vi innen én virkedag." },
  local: { team: "Hvem du møter hos oss" },
};

const konsulent = make(kontor, {
  key: "konsulent",
  label: "Konsulent og rådgiver",
  description: "Strategi, prosjektledelse og ledersparring.",
  schemaType: "ProfessionalService",
  hero: {
    title: (c) => `Rådgiver for små og mellomstore bedrifter${c.area}`,
    text: "Strategi, drift og ledelse, forklart uten stammespråk. Du får en plan dere faktisk klarer å gjennomføre.",
    button: "Ta kontakt",
    image: "Portrett av deg",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Strategi", "Hvor skal dere, og hva må til for å komme dit?"],
      ["Prosjektledelse", "Vi holder i trådene, så prosjektet blir ferdig."],
      ["Ledersparring", "En fast samtalepartner når det blåser."],
    ],
  },
  prices: [
    ["Første samtale", "Vi ser på hva du trenger.", SKRIV],
    ["Timepris", "", SKRIV],
    ["Fastpris på prosjekt", "Etter avtale.", ""],
  ],
});

const regnskap = make(kontor, {
  key: "regnskap",
  label: "Regnskap og revisjon",
  description: "Bokføring, lønn, mva og årsoppgjør.",
  schemaType: "AccountingService",
  hero: {
    title: (c) => `Regnskapsfører${c.area}`,
    text: "Bokføring, lønn, mva og årsoppgjør. Du får tid til å drive bedriften, vi holder orden på tallene.",
    button: "Ta kontakt",
    image: "Portrett av deg eller av dere på kontoret",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Løpende regnskap", "Bokføring, fakturering og avstemming hver måned."],
      ["Lønn", "Lønnskjøring, a-melding og feriepenger."],
      ["Årsoppgjør", "Skattemelding og årsregnskap levert i tide."],
    ],
  },
  prices: [
    ["Regnskap for enkeltpersonforetak", "Per måned.", SKRIV],
    ["Regnskap for AS", "Per måned.", SKRIV],
    ["Årsoppgjør", "", SKRIV],
  ],
});

const advokat = make(kontor, {
  key: "advokat",
  label: "Advokat",
  description: "Arv, familie, eiendom og arbeidsliv.",
  schemaType: "LegalService",
  hero: {
    title: (c) => `Advokat${c.area}`,
    text: "Arv, familie, eiendom eller arbeidsliv. Vi forklarer hvor du står, hva det koster og hva vi anbefaler.",
    button: "Ta kontakt",
    image: "Portrett av advokaten",
  },
  services: {
    heading: "Fagområder",
    items: [
      ["Arv og familie", "Testament, skifte, samboeravtale og skilsmisse."],
      ["Eiendom", "Kjøp, salg, naboforhold og mangler."],
      ["Arbeidsliv", "Oppsigelse, avtaler og konflikter på jobben."],
    ],
  },
  prices: [
    ["Innledende samtale", "30 minutter.", SKRIV],
    ["Timepris", "", SKRIV],
  ],
});

const eiendom = make(kontor, {
  key: "eiendom",
  label: "Eiendomsmegler",
  description: "Boligsalg, verdivurdering og utleie.",
  schemaType: "RealEstateAgent",
  hero: {
    title: (c) => `Eiendomsmegler${c.area}`,
    text: "Vi kjenner markedet her, og vi tar oss tid til å forstå hva boligen din er verdt for neste eier.",
    button: "Bestill verdivurdering",
    image: "Bilde av en bolig dere har solgt, eller av megleren",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Salg av bolig", "Fra verdivurdering til overtakelse."],
      ["Verdivurdering", "Hva er boligen din verdt i dag?"],
      ["Utleie", "Vi finner leietakere og tar oss av kontrakten."],
    ],
  },
  prices: [
    ["Verdivurdering", "", SKRIV],
    ["Provisjon ved salg", "", SKRIV],
  ],
});

const it = make(kontor, {
  key: "it",
  label: "IT og teknologi",
  description: "Drift, support, sikkerhet og utvikling.",
  schemaType: "ProfessionalService",
  themes: ["nordlys", "fjord", "puls", "kontor"],
  hero: {
    title: (c) => `IT-hjelp${c.area} på godt norsk`,
    text: "Nettverk, sikkerhet, Microsoft 365 og maskiner som bare virker. Vi svarer når du ringer.",
    button: "Ta kontakt",
    image: "Bilde av dere på jobb",
  },
  services: {
    heading: "Dette hjelper vi med",
    items: [
      ["Drift og support", "Fast pris per måned, og hjelp når noe stopper."],
      ["Sikkerhet", "Sikkerhetskopi, tofaktor og opplæring som faktisk hjelper."],
      ["Utvikling", "Løsninger som passer måten dere jobber på."],
    ],
  },
  prices: [
    ["Support per bruker", "Per måned.", SKRIV],
    ["Timepris", "", SKRIV],
  ],
});

// Kunst, foto og design. Skrevet i jeg-form, fordi de fleste her jobber alene.
const kreativ: Base = {
  themes: ["galleri", "atelier", "nordlys", "fjord"],
  benefits: [
    ["Laget for hånd", "Hvert verk er unikt"],
    ["Enkel bestilling", "Skriv hvordan folk bestiller eller kjøper"],
    ["Trygg levering", "Skriv hvordan verkene pakkes og sendes"],
  ],
  prices: { path: "/priser", title: "Priser", heading: "Priser" },
  about: {
    text: "Fortell om deg selv og arbeidet ditt: hvor du kommer fra, hva som driver deg og hvordan du jobber. Et portrett av deg gjør siden personlig.",
    image: "Portrett av deg, gjerne i atelieret eller på jobb",
  },
  gallery: { heading: "Utvalgte arbeider", image: "Bilde av et av arbeidene dine", page: { path: "/galleri", title: "Galleri" } },
  faq: [
    ["Kan jeg se arbeidene i virkeligheten?", "Skriv om folk kan besøke atelieret, eller hvor arbeidene stilles ut."],
    ["Tar du oppdrag?", "Skriv hva slags oppdrag du tar, og hvordan de bestilles."],
    ["Hvordan betaler jeg?", "Skriv hvilke betalingsmåter du tar imot."],
  ],
  cta: { heading: "Interessert?", text: "Send en melding om et verk, et oppdrag eller et samarbeid, så svarer jeg så fort jeg kan.", button: "Ta kontakt" },
  contact: { text: "Skriv om du er interessert i et verk, et oppdrag eller et samarbeid." },
};

const kunstner = make(kreativ, {
  key: "kunstner",
  label: "Kunstner",
  description: "Malerier, grafikk, keramikk og bestillingsverk.",
  schemaType: "ProfessionalService",
  hero: {
    title: (c) => `Kunst fra ${c.city || "atelieret"}`,
    text: "Originale verk og trykk, laget for hånd i mitt eget atelier. Ta kontakt om du vil se mer eller bestille.",
    button: "Se galleriet",
    link: "/galleri",
    variant: "bakgrunn",
    image: "Bilde av et av verkene dine",
  },
  services: {
    heading: "Kjøp kunst",
    items: [
      ["Originaler", "Unike verk, signert og datert."],
      ["Trykk og grafikk", "Nummererte opplag i små serier."],
      ["Bestillingsverk", "Et verk laget for deg og rommet ditt."],
    ],
  },
  prices: [
    ["Originaler", "Se pris på hvert verk i galleriet.", ""],
    ["Trykk, A3", "Nummerert og signert.", SKRIV],
    ["Bestillingsverk", "Pris etter avtale.", ""],
  ],
});

const fotograf = make(kreativ, {
  key: "fotograf",
  label: "Fotograf",
  description: "Bryllup, portrett, familie og bedrift.",
  schemaType: "ProfessionalService",
  benefits: [
    ["Bildene innen to uker", "Skriv hvor fort kundene får bildene"],
    ["Høy oppløsning", "Til både skjerm og trykk"],
    ["Avslappet stemning", "Jeg hjelper deg å slappe av foran kamera"],
  ],
  gallery: { heading: "Utvalgte bilder", image: "Et av dine beste bilder", page: { path: "/galleri", title: "Galleri" } },
  hero: {
    title: (c) => `Fotograf${c.area}`,
    text: "Bryllup, portrett, familie og bedrift. Bilder som ser ut som dere, bare på en god dag.",
    button: "Se bilder",
    link: "/galleri",
    variant: "bakgrunn",
    image: "Et av dine beste bilder",
  },
  services: {
    heading: "Fotografering",
    items: [
      ["Bryllup", "Hele dagen eller bare vielsen, du bestemmer."],
      ["Portrett og familie", "Ute i naturen eller i studio."],
      ["Bedrift", "Profilbilder og bilder til nettside og sosiale medier."],
    ],
  },
  prices: [
    ["Portrett, 1 time", "Inkludert 10 redigerte bilder.", SKRIV],
    ["Bryllup, halv dag", "", SKRIV],
    ["Bryllup, hel dag", "", SKRIV],
    ["Bedrift", "Etter avtale.", ""],
  ],
  cta: { heading: "Ledig på datoen din?", text: "Send en melding med dato og hva du ønsker, så hører du fra meg innen en dag.", button: "Sjekk dato" },
});

const designer = make(kreativ, {
  key: "designer",
  label: "Designer og arkitekt",
  description: "Logo, profil, interiør og arkitektur.",
  schemaType: "ProfessionalService",
  benefits: [
    ["Tett dialog", "Du ser skisser underveis"],
    ["Fast pris", "Du vet hva det koster før vi starter"],
    ["Ferdige filer", "Du får alt i riktig format"],
  ],
  hero: {
    title: (c) => `Design og arkitektur${c.area}`,
    text: "Fra første skisse til ferdig resultat. Jeg jobber tett med deg underveis, så du vet hva du får.",
    button: "Ta kontakt",
    image: "Bilde av et prosjekt du er stolt av",
  },
  services: {
    heading: "Dette gjør jeg",
    items: [
      ["Logo og profil", "En identitet som er lett å kjenne igjen."],
      ["Interiør og arkitektur", "Rom som fungerer og føles riktige."],
      ["Rådgivning", "En time eller to når du står fast."],
    ],
  },
  prices: [
    ["Timepris", "", SKRIV],
    ["Logo og profil", "Fast pris.", SKRIV],
  ],
});

const musiker = make(kreativ, {
  key: "musiker",
  label: "Musiker og band",
  description: "Bryllup, firmafest og konserter.",
  schemaType: "MusicGroup",
  themes: ["nordlys", "puls", "galleri"],
  benefits: [
    ["Spiller det dere vil høre", "Send oss ønskelista"],
    ["Eget lydanlegg", "Skriv hva dere har med"],
    ["Fast pris", "Reise og rigg er med i prisen"],
  ],
  gallery: { heading: "Fra scenen", image: "Bilde fra en konsert eller spillejobb", page: { path: "/bilder", title: "Bilder" } },
  hero: {
    title: () => "Musikk til festen, bryllupet og scenen",
    text: "Vi spiller på bryllup, firmafester og konserter. Send en forespørsel, så får du ledige datoer og pris.",
    button: "Book oss",
    variant: "bakgrunn",
    image: "Bilde fra en konsert",
  },
  services: {
    heading: "Vi spiller",
    items: [
      ["Bryllup", "Fra vielsen til siste dans."],
      ["Firmafest", "Musikk som får folk ut på gulvet."],
      ["Konsert", "Egne låter og favoritter."],
    ],
  },
  prices: [
    ["Bryllup", "", SKRIV],
    ["Firmafest", "", SKRIV],
  ],
  cta: { heading: "Book oss", text: "Send dato, sted og hva slags fest det er, så svarer vi med pris og ledighet.", button: "Send forespørsel" },
});

// Trening og aktivitet
const trening: Base = {
  themes: ["puls", "nordlys", "fjord", "leken"],
  benefits: [
    ["Prøv før du bestemmer deg", "Skriv om dere har prøvetime"],
    ["Ingen bindingstid", "Skriv vilkårene for medlemskapet"],
    ["Instruktører som ser deg", "Små grupper og god oppfølging"],
  ],
  prices: { path: "/priser", title: "Priser", heading: "Medlemskap og priser" },
  about: {
    text: "Fortell hvem som står bak, hvilken utdanning instruktørene har og hva som gjør stedet annerledes. Bilder fra timene viser mer enn tekst.",
    image: "Bilde fra en time eller av instruktørene",
  },
  gallery: { heading: "Fra timene", image: "Bilde fra en treningstime" },
  faq: [
    ["Må jeg være i form for å begynne?", "Skriv hvordan nybegynnere blir tatt imot."],
    ["Hva må jeg ha med?", "Skriv hva folk trenger å ta med første gang."],
    ["Hvordan melder jeg meg inn?", "Skriv hvordan innmelding og betaling foregår."],
  ],
  cta: { heading: "Bli med på en time", text: "Send oss en melding, så finner vi en time som passer for deg.", button: "Bli med" },
  contact: { text: "Spørsmål om timer, medlemskap eller personlig trening? Skriv til oss." },
  local: { team: "Instruktørene", hours: true, map: true },
};

const pt = make(trening, {
  key: "pt",
  label: "Personlig trener",
  description: "PT, trening for to og kostholdsveiledning.",
  schemaType: "HealthAndBeautyBusiness",
  gallery: undefined,
  hero: {
    title: (c) => `Personlig trener${c.area}`,
    text: "Trening som passer livet ditt, ikke omvendt. Vi lager en plan du klarer å holde, og jeg følger deg hele veien.",
    button: "Bestill time",
    image: "Bilde av deg på jobb",
  },
  services: {
    heading: "Slik jobber jeg",
    items: [
      ["PT en til en", "Full oppfølging, tilpasset deg."],
      ["PT for to", "Tren med en venn og del prisen."],
      ["Kostholdsveiledning", "Enkle grep som varer."],
    ],
  },
  prices: [
    ["Enkelttime", "60 min.", SKRIV],
    ["Klippekort, 10 timer", "", SKRIV],
    ["PT for to", "Per time.", SKRIV],
  ],
});

const treningssenter = make(trening, {
  key: "treningssenter",
  label: "Treningssenter",
  description: "Gruppetimer, fri trening og personlig trener.",
  schemaType: "ExerciseGym",
  hero: {
    title: (c) => `Treningssenter${c.area}`,
    text: "Utstyr som virker, timer for alle nivåer og folk som hilser når du kommer.",
    button: "Bli medlem",
    image: "Bilde fra treningssalen",
  },
  services: {
    heading: "Hos oss",
    items: [
      ["Gruppetimer", "Styrke, spinning, sirkel og yoga."],
      ["Fri trening", "Utstyr for styrke og kondisjon."],
      ["Personlig trener", "Når du vil ha ekstra oppfølging."],
    ],
  },
  prices: [
    ["Medlemskap", "Per måned.", SKRIV],
    ["Student og honnør", "Per måned.", SKRIV],
    ["Dagskort", "", SKRIV],
  ],
});

const yoga = make(trening, {
  key: "yoga",
  label: "Yoga og pilates",
  description: "Yoga, pilates og avspenning.",
  schemaType: "SportsActivityLocation",
  themes: ["klinikk", "atelier", "fjord"],
  hero: {
    title: (c) => `Yoga og pilates${c.area}`,
    text: "Rolige timer for kropp og hode, for nybegynnere og deg som har holdt på lenge.",
    button: "Se timeplanen",
    link: "/priser",
    image: "Bilde fra en time",
  },
  services: {
    heading: "Timer",
    items: [
      ["Yoga for nybegynnere", "Lær grunnstillingene i ditt eget tempo."],
      ["Pilates", "Sterk kjerne og bedre holdning."],
      ["Yin og avspenning", "Rolig yoga som hjelper deg å lande."],
    ],
  },
  prices: [
    ["Drop-in", "", SKRIV],
    ["Klippekort, 10 timer", "", SKRIV],
    ["Fri tilgang", "Per måned.", SKRIV],
  ],
});

const kurs = make(trening, {
  key: "kurs",
  label: "Dans og kampsport",
  description: "Kurs og partier for barn, ungdom og voksne.",
  schemaType: "SportsActivityLocation",
  themes: ["puls", "leken", "nordlys"],
  hero: {
    title: (c) => `Kurs for barn, ungdom og voksne${c.area}`,
    text: "Lær noe nytt sammen med andre. Vi har partier for alle nivåer, og første time kan du bare prøve.",
    button: "Meld deg på",
    image: "Bilde fra en time",
  },
  services: {
    heading: "Kurs",
    items: [
      ["Barn", "Lek og læring fra fire år."],
      ["Ungdom", "Teknikk, mestring og et godt miljø."],
      ["Voksne", "Det er aldri for sent å begynne."],
    ],
  },
  prices: [
    ["Semesteravgift, barn", "", SKRIV],
    ["Semesteravgift, voksne", "", SKRIV],
    ["Prøvetime", "", SKRIV],
  ],
});

// Reise og opplevelser
const opplevelser: Base = {
  themes: ["hytte", "fjord", "bistro", "nordlys"],
  benefits: [
    ["Midt i naturen", "Skriv hva som ligger like i nærheten"],
    ["Enkel bestilling", "Skriv hvordan gjestene bestiller"],
    ["Lokalkjente verter", "Vi deler gjerne de beste tipsene"],
  ],
  prices: { path: "/priser", title: "Priser", heading: "Priser" },
  about: {
    text: "Fortell historien om stedet og menneskene bak. Hva gjør dere annerledes, og hva husker gjestene best når de reiser hjem?",
    image: "Bilde av stedet",
  },
  gallery: { heading: "Stedet", image: "Bilde av stedet eller naturen rundt", page: { path: "/bilder", title: "Bilder" } },
  faq: [
    ["Når kan vi sjekke inn?", "Skriv tider for innsjekk og utsjekk."],
    ["Er det lov med hund?", "Skriv om dyr er velkomne, og om det koster noe."],
    ["Hva hvis vi må avbestille?", "Skriv avbestillingsreglene."],
  ],
  cta: { heading: "Sjekk ledige datoer", text: "Send oss datoene og hvor mange dere er, så svarer vi med pris og ledighet.", button: "Spør om ledighet" },
  contact: { text: "Skriv datoer og antall personer, så svarer vi så fort vi kan." },
  local: { map: true },
};

const overnatting = make(opplevelser, {
  key: "overnatting",
  label: "Overnatting og hytteutleie",
  description: "Rom, hytter, camping og gjestehus.",
  schemaType: "LodgingBusiness",
  hero: {
    title: (c) => `Overnatting${c.area}`,
    text: "Rolige netter, gode senger og naturen rett utenfor døra. Bo hos oss en natt eller en hel uke.",
    button: "Spør om ledighet",
    variant: "bakgrunn",
    image: "Bilde av stedet utenfra",
  },
  services: {
    heading: "Bo hos oss",
    items: [
      ["Rom og hytter", "For to eller for hele familien."],
      ["Frokost", "Lokal mat, servert hver morgen."],
      ["Aktiviteter", "Fiske, turer og utleie av utstyr."],
    ],
  },
  prices: [
    ["Dobbeltrom", "Per natt, inkludert frokost.", SKRIV],
    ["Hytte for fire", "Per natt.", SKRIV],
    ["Sengetøy og håndklær", "Per person.", SKRIV],
  ],
});

const guide = make(opplevelser, {
  key: "guide",
  label: "Guide og aktiviteter",
  description: "Turer, utleie av utstyr og firmaopplevelser.",
  schemaType: "LocalBusiness",
  hero: {
    title: (c) => `Turer og opplevelser${c.area}`,
    text: "Vi tar deg med ut, enten du vil padle, fiske, gå på topptur eller bare se noe nytt. Utstyr og trygghet er med.",
    button: "Bestill tur",
    variant: "bakgrunn",
    image: "Bilde fra en tur",
  },
  services: {
    heading: "Opplevelser",
    items: [
      ["Guidede turer", "For grupper, familier og firma."],
      ["Utleie av utstyr", "Kano, kajakk, sykkel og ski."],
      ["Firmaopplevelser", "Teambygging folk husker."],
    ],
  },
  prices: [
    ["Guidet tur, halv dag", "Per person.", SKRIV],
    ["Leie av kano", "Per dag.", SKRIV],
    ["Firmaopplevelse", "Etter avtale.", ""],
  ],
  cta: { heading: "Klar for tur?", text: "Fortell hva dere har lyst til, hvor mange dere er og når, så setter vi sammen en tur.", button: "Bestill tur" },
});

// Lag, forening og arrangement
const forening: Base = {
  themes: ["leken", "fjord", "puls", "hytte"],
  benefits: [
    ["Åpent for alle", "Skriv hvem som kan bli med"],
    ["Drevet av frivillige", "Skriv hvordan folk kan bidra"],
    ["Aktiviteter hele året", "Skriv hva som skjer gjennom året"],
  ],
  prices: { path: "/bli-medlem", title: "Bli medlem", heading: "Bli medlem" },
  about: {
    text: "Fortell når laget ble startet, hva dere driver med og hvem som sitter i styret. Nye medlemmer vil vite hva de blir med på.",
    image: "Bilde fra en aktivitet",
  },
  gallery: { heading: "Bilder fra laget", image: "Bilde fra en aktivitet eller et arrangement" },
  faq: [
    ["Hva koster det å være med?", "Skriv kontingenten og hva den dekker."],
    ["Hvordan melder jeg meg inn?", "Skriv hvordan innmelding foregår."],
    ["Hvem kan jeg kontakte?", "Skriv hvem i styret som svarer på spørsmål."],
  ],
  cta: { heading: "Vil du være med?", text: "Send oss en melding, så forteller vi mer om hvordan du blir medlem.", button: "Bli med" },
  contact: { text: "Spørsmål om laget, medlemskap eller arrangementer? Skriv til oss." },
};

const idrettslag = make(forening, {
  key: "idrettslag",
  label: "Idrettslag og klubb",
  description: "Aktiviteter for barn, ungdom og voksne.",
  schemaType: "SportsClub",
  hero: {
    title: (c) => `Idrett for alle${c.area}`,
    text: "Vi har aktiviteter for barn, ungdom og voksne. Kom på en trening, så finner vi et parti som passer.",
    button: "Bli med",
    image: "Bilde fra en trening eller kamp",
  },
  services: {
    heading: "Aktiviteter",
    items: [
      ["Barn", "Allidrett og lek fra seks år."],
      ["Ungdom", "Lag og treninger med vekt på mestring."],
      ["Voksne", "Trim, mosjon og veteranlag."],
    ],
  },
  prices: [
    ["Medlemskontingent, barn", "Per år.", SKRIV],
    ["Medlemskontingent, voksne", "Per år.", SKRIV],
    ["Treningsavgift", "Per sesong.", SKRIV],
  ],
});

const lag = make(forening, {
  key: "lag",
  label: "Forening og lag",
  description: "Velforening, kor, korps, historielag og andre lag.",
  schemaType: "Organization",
  hero: {
    title: (c) => `Et fellesskap${c.area} for alle som vil være med`,
    text: "Vi møtes jevnlig, lager arrangementer og tar vare på det vi bryr oss om. Nye medlemmer er alltid velkomne.",
    button: "Bli medlem",
    image: "Bilde fra et møte eller arrangement",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Faste møter", "Skriv hvor og når dere møtes."],
      ["Arrangementer", "Skriv hvilke arrangementer dere har gjennom året."],
      ["Dugnad", "Skriv hva medlemmene gjør sammen."],
    ],
  },
  prices: [
    ["Medlemskap", "Per år.", SKRIV],
    ["Familiemedlemskap", "Per år.", SKRIV],
  ],
});

const arrangement = make(forening, {
  key: "arrangement",
  label: "Festival og arrangement",
  description: "Program, billettpriser og praktisk info.",
  schemaType: "Organization",
  themes: ["puls", "nordlys", "leken"],
  benefits: [
    ["Hele programmet", "Skriv hva som skjer, og når"],
    ["Lett å komme hit", "Skriv om parkering, buss og tog"],
    ["For hele familien", "Skriv aldersgrenser og tilbud for barn"],
  ],
  gallery: { heading: "Fra i fjor", image: "Bilde fra fjorårets arrangement" },
  hero: {
    title: (c) => `Årets beste helg${c.area}`,
    text: "Musikk, mat og folk du kjenner. Her finner du programmet, billettprisene og veien hit.",
    button: "Se billetter",
    link: "/billetter",
    variant: "bakgrunn",
    image: "Bilde fra arrangementet",
  },
  services: {
    heading: "Programmet",
    items: [
      ["Fredag", "Skriv hva som skjer."],
      ["Lørdag", "Skriv hva som skjer."],
      ["Søndag", "Skriv hva som skjer."],
    ],
  },
  pricePage: { path: "/billetter", title: "Billetter", heading: "Billetter" },
  prices: [
    ["Dagspass", "", SKRIV],
    ["Helgepass", "", SKRIV],
    ["Barn under 12", "I følge med voksen.", SKRIV],
  ],
  faq: [
    ["Er det aldersgrense?", "Skriv aldersgrenser for de ulike delene av arrangementet."],
    ["Hvordan kommer jeg meg dit?", "Skriv om parkering, buss, tog og sykkel."],
    ["Er arrangementet tilgjengelig for rullestol?", "Skriv om adkomst, toaletter og plasser foran scenen."],
  ],
  cta: { heading: "Sikre deg billett", text: "Har du spørsmål om programmet, alder eller tilgjengelighet? Send oss en melding.", button: "Kontakt oss" },
});

// Service og annet
const service: Base = {
  themes: ["fjord", "verksted", "kontor", "leken"],
  benefits: [
    ["Fast pris", "Du vet hva det koster før vi starter"],
    ["Raskt svar", "Skriv hvor fort dere svarer"],
    ["Lokalt og personlig", "Skriv hvilket område dere dekker"],
  ],
  prices: { path: "/tjenester", title: "Tjenester og priser", heading: "Tjenester og priser" },
  about: {
    text: "Fortell hvem dere er, hvor lenge dere har holdt på og hvorfor kundene velger dere. Bilder av folkene gjør det lettere å stole på dere.",
    image: "Bilde av dere på jobb",
  },
  faq: [
    ["Hva koster det?", "Skriv hvordan dere priser jobbene."],
    ["Hvor fort kan dere komme?", "Skriv vanlig ventetid."],
    ["Hvilket område dekker dere?", "Skriv kommunene eller stedene dere jobber i."],
  ],
  cta: { heading: "Trenger du hjelp?", text: "Send en kort beskrivelse av hva du trenger, så får du svar og pris.", button: "Få pris" },
  // Bilder hjelper på pris for renhold, flytting og verksted. Feltet er valgfritt.
  contact: {
    text: "Skriv kort hva du trenger hjelp med, så svarer vi så fort vi kan.",
    fields: [{ etikett: "Bilder", felttype: "bilder", pakrevd: "nei" }],
  },
  local: { hours: true, map: true },
};

const bilverksted = make(service, {
  key: "bilverksted",
  label: "Bilverksted",
  description: "Service, EU-kontroll, dekk og reparasjoner.",
  schemaType: "AutoRepair",
  themes: ["verksted", "fjord", "kontor"],
  hero: {
    title: (c) => `Bilverksted${c.area}`,
    text: "Service, EU-kontroll, dekkskift og reparasjoner på alle bilmerker. Du får pris før vi begynner.",
    button: "Bestill time",
    image: "Bilde fra verkstedet",
  },
  services: {
    heading: "Verkstedet",
    items: [
      ["Service", "Etter fabrikkens program, uten at du mister garantien."],
      ["EU-kontroll", "Vi fikser det som må fikses, og tar kontrollen."],
      ["Dekk og hjul", "Dekkskift, dekkhotell og nye dekk."],
    ],
  },
  prices: [
    ["EU-kontroll", "", SKRIV],
    ["Dekkskift", "", SKRIV],
    ["Timepris verksted", "", SKRIV],
  ],
});

const renhold = make(service, {
  key: "renhold",
  label: "Rengjøring og renhold",
  description: "Vaskehjelp, kontorrenhold og flyttevask.",
  schemaType: "ProfessionalService",
  benefits: [
    ["Godkjent renholdsvirksomhet", "Skriv at dere står i Arbeidstilsynets register"],
    ["Faste folk", "Du slipper å forklare alt på nytt"],
    ["Fast pris", "Du vet hva det koster før vi starter"],
  ],
  hero: {
    title: (c) => `Rengjøring${c.area}`,
    text: "Vaskehjelp hjemme, renhold på kontoret og flyttevask. Du får faste folk og fast pris.",
    button: "Få pris",
    image: "Bilde av dere på jobb",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Vaskehjelp", "Hver uke eller annenhver, med de samme folkene."],
      ["Kontorrenhold", "Rent og ryddig før dere kommer på jobb."],
      ["Flyttevask", "Vi vasker til både utleier og ny eier blir fornøyd."],
    ],
  },
  prices: [
    ["Vaskehjelp", "Per time.", SKRIV],
    ["Flyttevask", "Pris etter størrelse.", SKRIV],
    ["Vindusvask", "", SKRIV],
  ],
});

const flytting = make(service, {
  key: "flytting",
  label: "Flytting og transport",
  description: "Flytting, pakking og bortkjøring.",
  schemaType: "MovingCompany",
  hero: {
    title: (c) => `Flyttehjelp${c.area}`,
    text: "Vi pakker, bærer og kjører, og setter alt på plass i det nye hjemmet. Fast pris uten overraskelser.",
    button: "Få pris",
    image: "Bilde av flyttebilen eller gjengen",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Flytting", "Bolig og kontor, i hele landet."],
      ["Pakking", "Vi pakker forsiktig, også det skjøre."],
      ["Bortkjøring", "Vi tar med det du ikke vil ha med deg."],
    ],
  },
  prices: [
    ["Befaring", "Vi ser på oppdraget og gir fast pris.", SKRIV],
    ["Flyttebil med to personer", "Per time.", SKRIV],
  ],
});

const dyr = make(service, {
  key: "dyr",
  label: "Dyr og kjæledyr",
  description: "Hundepass, lufting, stell og klipp.",
  schemaType: "ProfessionalService",
  themes: ["leken", "fjord", "hytte"],
  benefits: [
    ["Bilder underveis", "Du får beskjed og bilder mens du er borte"],
    ["Erfarne dyrevenner", "Skriv hvilken erfaring og utdanning dere har"],
    ["Trygt og forsikret", "Skriv hvordan dere er forsikret"],
  ],
  hero: {
    title: (c) => `Hundepass og dyrestell${c.area}`,
    text: "Vi passer, lufter og steller dyret ditt som om det var vårt eget. Du får bilder og beskjed underveis.",
    button: "Bestill",
    image: "Bilde av et dyr dere passer",
  },
  services: {
    heading: "Dette gjør vi",
    items: [
      ["Hundepass", "Dagpass og overnatting."],
      ["Lufting", "Turer midt på dagen mens du er på jobb."],
      ["Stell og klipp", "Bading, klipp og klor."],
    ],
  },
  prices: [
    ["Dagpass", "", SKRIV],
    ["Lufting, 30 min", "", SKRIV],
    ["Overnatting", "Per natt.", SKRIV],
  ],
});

const bedrift = make(service, {
  key: "bedrift",
  label: "Annen bedrift",
  description: "Et godt utgangspunkt for alle andre bransjer.",
  schemaType: "LocalBusiness",
  hero: {
    title: () => "Skriv hva dere tilbyr, kort og tydelig",
    text: "Fortell hvem dere hjelper og hvorfor de skal velge dere. To setninger holder.",
    button: "Ta kontakt",
    image: "Bilde som viser hva dere driver med",
  },
  services: {
    heading: "Dette tilbyr vi",
    items: [
      ["Det dere er best på", "Skriv kort hva det er og hvem det passer for."],
      ["Det kundene spør mest om", "Skriv kort hva det er og hvem det passer for."],
      ["Noe folk ikke vet at dere gjør", "Skriv kort hva det er og hvem det passer for."],
    ],
  },
  prices: [["Skriv navnet på tjenesten", "Skriv kort hva som er inkludert.", SKRIV]],
});

export const servicePacks = [
  rorlegger,
  elektriker,
  snekker,
  maler,
  taktekker,
  anlegg,
  frisor,
  hudpleie,
  massasje,
  fysioterapeut,
  kiropraktor,
  psykolog,
  tannlege,
  kafe,
  restaurant,
  bakeri,
  catering,
  konsulent,
  regnskap,
  advokat,
  eiendom,
  it,
  kunstner,
  fotograf,
  designer,
  musiker,
  pt,
  treningssenter,
  yoga,
  kurs,
  overnatting,
  guide,
  idrettslag,
  lag,
  arrangement,
  bilverksted,
  renhold,
  flytting,
  dyr,
  bedrift,
].map(servicePack);
