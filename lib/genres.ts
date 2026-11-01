import { getPack, type Pack } from "@/lib/packs";

/**
 * Sjangrene i «Nytt nettsted». Kunden velger først en bred sjanger hun kjenner seg igjen i, så bransjen.
 * Hver bransje er en bransjepakke (lib/packs). Næringskodene er prefikser fra Enhetsregisteret, så
 * forslaget treffer både gamle (SN2007) og nye (SN2025) koder så langt de deler start.
 */

export type GenreIcon = "hammer" | "saks" | "hjerte" | "kopp" | "pose" | "koffert" | "pensel" | "manual" | "fjell" | "folk" | "nokkel";

export type Bransje = {
  /** Nøkkelen til bransjepakken. */
  pack: string;
  /** Visningsnavn når det skal være noe annet enn pakkens eget navn. */
  label?: string;
  /** Næringskoder som peker rett hit. Lengste treff vinner. */
  nace?: string[];
  /** Ord folk søker med, og ord som står i næringsbeskrivelsen hos Brreg. */
  keywords: string[];
};

export type Genre = {
  key: string;
  label: string;
  description: string;
  icon: GenreIcon;
  nace: string[];
  bransjer: Bransje[];
};

export const genres: Genre[] = [
  {
    key: "handverk",
    label: "Håndverk og bygg",
    description: "Rørlegger, elektriker, snekker, maler og andre som jobber hjemme hos kunden.",
    icon: "hammer",
    nace: ["41", "42", "43"],
    bransjer: [
      { pack: "rorlegger", nace: ["43.22"], keywords: ["rørlegger", "rør", "vvs", "bad", "baderom", "våtrom", "varmtvann", "lekkasje", "rørleggerarbeid"] },
      { pack: "elektriker", nace: ["43.21"], keywords: ["elektriker", "elektro", "elektrisk", "strøm", "sikring", "elbillader", "lys", "installasjon"] },
      { pack: "snekker", nace: ["43.32", "41.2"], keywords: ["snekker", "tømrer", "byggmester", "rehabilitering", "tilbygg", "terrasse", "kjøkken", "vinduer", "oppføring av bygninger"] },
      { pack: "maler", nace: ["43.34"], keywords: ["maler", "malerarbeid", "malermester", "maling", "tapet", "sparkel", "fasade", "beis"] },
      { pack: "taktekker", nace: ["43.91"], keywords: ["tak", "taktekker", "takarbeid", "takstein", "takrenne", "blikkenslager"] },
      { pack: "anlegg", nace: ["43.1", "42", "81.3"], keywords: ["anleggsgartner", "graving", "gravemaskin", "grunnarbeid", "hage", "belegningsstein", "drenering", "plen", "beplantning"] },
      { pack: "handverker", label: "Annet håndverk", keywords: ["håndverker", "håndverk", "bygg", "murer", "flislegger", "glass", "isolasjon"] },
    ],
  },
  {
    key: "skjonnhet",
    label: "Skjønnhet og velvære",
    description: "Frisør, hudpleie, negler, massasje og spa.",
    icon: "saks",
    nace: ["96.02", "96.04", "96.2"],
    bransjer: [
      { pack: "frisor", nace: ["96.021", "96.21"], keywords: ["frisør", "frisering", "frisørsalong", "hår", "klipp", "farge", "salong", "barber", "barbering"] },
      { pack: "hudpleie", nace: ["96.022", "96.22"], keywords: ["hudpleie", "hudpleier", "skjønnhetspleie", "skjønnhet", "vipper", "bryn", "negler", "negl", "manikyr", "voks", "kosmetolog"] },
      { pack: "massasje", nace: ["96.04", "96.23"], keywords: ["massasje", "massør", "spa", "velvære", "kroppspleie", "badstue"] },
    ],
  },
  {
    key: "helse",
    label: "Helse og behandling",
    description: "Fysioterapeut, kiropraktor, psykolog og tannlege.",
    icon: "hjerte",
    nace: ["86"],
    bransjer: [
      { pack: "fysioterapeut", keywords: ["fysioterapi", "fysioterapeut", "fysio", "manuellterapi", "manuellterapeut", "rehabilitering", "fysioterapitjeneste"] },
      { pack: "kiropraktor", keywords: ["kiropraktor", "naprapat", "osteopat", "kiropraktikk"] },
      { pack: "psykolog", keywords: ["psykolog", "psykologtjeneste", "terapeut", "terapi", "samtaleterapi", "parterapi", "psykiatri"] },
      { pack: "tannlege", nace: ["86.23"], keywords: ["tannlege", "tannhelse", "tannklinikk", "tannpleier", "tenner", "tannhelsetjenester"] },
    ],
  },
  {
    key: "mat",
    label: "Mat og drikke",
    description: "Restaurant, kafé, bakeri og catering.",
    icon: "kopp",
    nace: ["56", "10.71", "11.0"],
    bransjer: [
      { pack: "restaurant", keywords: ["restaurant", "restauranter", "spisested", "middag", "bistro", "pizza", "sushi", "gatekjøkken"] },
      { pack: "kafe", keywords: ["kafé", "kafe", "kafeer", "kaffe", "kaffebar", "bakst", "lunsj"] },
      { pack: "bakeri", nace: ["10.71"], keywords: ["bakeri", "konditori", "kake", "kaker", "brød", "baker", "ferske konditorvarer"] },
      { pack: "catering", nace: ["56.21"], keywords: ["catering", "cateringvirksomhet", "matbil", "food truck", "selskapsmat", "koldtbord"] },
    ],
  },
  {
    key: "butikk",
    label: "Nettbutikk",
    description: "Selg varer på nett, med handlekurv, kasse og frakt.",
    icon: "pose",
    nace: ["47", "01"],
    bransjer: [
      { pack: "nettbutikk", label: "Nettbutikk", keywords: ["nettbutikk", "butikk", "netthandel", "detaljhandel", "varer", "postordre", "internett"] },
      { pack: "klaer", nace: ["47.71", "47.72"], keywords: ["klær", "mote", "sko", "tilbehør", "smykker", "veske"] },
      { pack: "interior", nace: ["47.5", "47.78"], keywords: ["interiør", "gaver", "gavebutikk", "keramikk", "brukskunst", "møbler", "lamper"] },
      { pack: "lokalmat", nace: ["47.2", "01"], keywords: ["gårdsbutikk", "lokalmat", "gård", "gårdsbruk", "honning", "egg", "kjøtt", "dyrking", "jordbruk"] },
    ],
  },
  {
    key: "kontor",
    label: "Rådgivning og kontor",
    description: "Konsulent, regnskap, advokat, eiendom og IT.",
    icon: "koffert",
    nace: ["62", "63", "64", "65", "66", "68", "69", "70", "74.9", "78", "82.1"],
    bransjer: [
      { pack: "konsulent", nace: ["70"], keywords: ["konsulent", "rådgiver", "rådgivning", "bedriftsrådgivning", "coach", "strategi", "prosjektleder", "ledelse"] },
      { pack: "regnskap", nace: ["69.2"], keywords: ["regnskap", "regnskapsfører", "revisor", "revisjon", "lønn", "bokføring", "årsoppgjør"] },
      { pack: "advokat", nace: ["69.1"], keywords: ["advokat", "advokatfirma", "jurist", "juridisk", "arv", "skilsmisse", "kontrakt"] },
      { pack: "eiendom", nace: ["68.3"], keywords: ["eiendom", "eiendomsmegler", "eiendomsmegling", "megler", "bolig", "boligsalg", "utleie"] },
      { pack: "it", nace: ["62", "63"], keywords: ["it", "data", "programvare", "utvikling", "nettverk", "support", "teknologi", "apper", "konsulentvirksomhet tilknyttet informasjonsteknologi"] },
    ],
  },
  {
    key: "kreativ",
    label: "Kunst, foto og design",
    description: "Kunstner, fotograf, designer og musiker.",
    icon: "pensel",
    nace: ["90", "74.1", "74.2", "71.1", "73.1", "59"],
    bransjer: [
      { pack: "kunstner", nace: ["90.03", "90.3"], keywords: ["kunstner", "kunst", "billedkunstner", "maleri", "malerier", "grafikk", "keramiker", "skulptur", "illustratør", "kunstnerisk"] },
      { pack: "fotograf", nace: ["74.2"], keywords: ["fotograf", "foto", "fotografering", "fotografvirksomhet", "bryllupsfotograf", "portrett"] },
      { pack: "designer", nace: ["74.1", "71.1", "73.1"], keywords: ["design", "designer", "grafisk", "arkitekt", "arkitektvirksomhet", "interiørarkitekt", "logo", "reklame"] },
      { pack: "musiker", nace: ["90.01", "90.1", "59.2"], keywords: ["musiker", "band", "musikk", "artist", "konsert", "dj", "sanger", "utøvende"] },
    ],
  },
  {
    key: "trening",
    label: "Trening og aktivitet",
    description: "Personlig trener, treningssenter, yoga og kurs.",
    icon: "manual",
    nace: ["93.1", "85.5"],
    bransjer: [
      { pack: "treningssenter", nace: ["93.13"], keywords: ["treningssenter", "treningssentre", "gym", "crossfit", "styrke", "spinning"] },
      { pack: "pt", keywords: ["personlig trener", "pt", "trener", "kosthold", "trening"] },
      { pack: "yoga", keywords: ["yoga", "pilates", "meditasjon", "mindfulness", "barre"] },
      { pack: "kurs", nace: ["85.51", "85.52"], keywords: ["dans", "danseskole", "ballett", "kampsport", "karate", "taekwondo", "judo", "boksing", "kurs"] },
    ],
  },
  {
    key: "opplevelser",
    label: "Reise og opplevelser",
    description: "Overnatting, hytteutleie, guide og aktiviteter.",
    icon: "fjell",
    nace: ["55", "79", "93.2"],
    bransjer: [
      { pack: "overnatting", nace: ["55"], keywords: ["overnatting", "hytte", "hytteutleie", "hotell", "pensjonat", "gjestehus", "camping", "ferieleiligheter", "rom"] },
      { pack: "guide", nace: ["79", "93.2"], keywords: ["guide", "guiding", "tur", "turer", "rafting", "fisketur", "opplevelse", "aktivitet", "utleie", "reisearrangør"] },
    ],
  },
  {
    key: "forening",
    label: "Lag og foreninger",
    description: "Idrettslag, foreninger, kor, korps og arrangementer.",
    icon: "folk",
    nace: ["94", "93.12", "90.02", "82.3"],
    bransjer: [
      { pack: "idrettslag", nace: ["93.12"], keywords: ["idrettslag", "idrett", "fotball", "håndball", "ski", "klubb", "turn", "sportsklubb", "idrettslag og klubber"] },
      { pack: "lag", nace: ["94"], keywords: ["forening", "velforening", "lag", "kor", "korps", "historielag", "frivillig", "organisasjon", "interesseorganisasjon"] },
      { pack: "arrangement", nace: ["90.02", "82.3"], keywords: ["festival", "arrangement", "messe", "marked", "event", "kongress"] },
    ],
  },
  {
    key: "service",
    label: "Service og annet",
    description: "Bilverksted, rengjøring, flytting, dyrepass og alt annet.",
    icon: "nokkel",
    nace: ["45", "49.4", "75", "77", "81", "95", "96"],
    bransjer: [
      { pack: "bilverksted", nace: ["45"], keywords: ["bil", "bilverksted", "verksted", "eu-kontroll", "dekk", "mekaniker", "lakk", "motorvogner"] },
      { pack: "renhold", nace: ["81.2"], keywords: ["rengjøring", "renhold", "vask", "vaskehjelp", "flyttevask", "vinduspuss", "rengjøring av bygninger"] },
      { pack: "flytting", nace: ["49.42", "49.4"], keywords: ["flytting", "flyttebyrå", "transport", "budbil", "varebil", "bortkjøring", "godstransport"] },
      { pack: "dyr", nace: ["75", "96.09"], keywords: ["hund", "katt", "dyr", "dyrepass", "hundepass", "hundefrisør", "dyrlege", "veterinær", "kennel", "hundetrening"] },
      { pack: "bedrift", label: "Annen bedrift", keywords: ["annet", "annen", "bedrift", "firma", "tjeneste"] },
    ],
  },
];

export type BransjeMatch = { genre: Genre; bransje: Bransje; pack: Pack };

export function bransjeLabel(bransje: Bransje): string {
  return bransje.label ?? getPack(bransje.pack)?.label ?? bransje.pack;
}

/** «IT og teknologi» beholder store bokstaver, «Frisør» blir «frisør» midt i en setning. */
export function lowerLabel(label: string): string {
  return /^[A-ZÆØÅ]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function match(genre: Genre, bransje: Bransje): BransjeMatch | null {
  const pack = getPack(bransje.pack);
  return pack ? { genre, bransje, pack } : null;
}

/** Sjangeren og bransjen en pakke hører til. Brukes for å vise valget igjen i studioet. */
export function findBransje(packKey: string): BransjeMatch | null {
  for (const genre of genres) {
    const bransje = genre.bransjer.find((b) => b.pack === packKey);
    if (bransje) return match(genre, bransje);
  }
  return null;
}

/** Små bokstaver uten aksenter, med æ, ø og å skrevet om, så «frisor» og «frisør» gir samme treff. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Søk i sjangre og bransjer. Treff på starten av navnet teller mest, så nøkkelord, så forklaringen.
 * Tomt søk gir ingen treff, siden alle sjangrene da vises uansett.
 */
export function searchBransjer(query: string, limit = 8): BransjeMatch[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const scored: { m: BransjeMatch; score: number }[] = [];
  for (const genre of genres) {
    for (const bransje of genre.bransjer) {
      const m = match(genre, bransje);
      if (!m) continue;
      const label = fold(bransjeLabel(bransje));
      const keywords = bransje.keywords.map(fold);
      const rest = fold(`${genre.label} ${m.pack.description}`);
      let score = 0;
      for (const w of words) {
        if (label.startsWith(w) || label.split(/[\s,]+/).some((part) => part.startsWith(w))) score += 10;
        else if (keywords.some((k) => k.startsWith(w))) score += 6;
        else if (keywords.some((k) => k.includes(w)) || label.includes(w)) score += 3;
        else if (rest.includes(w)) score += 1;
      }
      if (score > 0) scored.push({ m, score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.m);
}

/**
 * Forslag ut fra næringskoden og beskrivelsen i Enhetsregisteret. Først lengste kodetreff på en bransje,
 * så på en sjanger (der ord i beskrivelsen velger bransje), og til slutt et vanlig søk i beskrivelsen.
 */
export function suggestFromBrreg(code: string, description = ""): BransjeMatch | null {
  const kode = code.trim();
  const text = fold(description);
  const tokens = text.split(/[^a-z0-9-]+/).filter(Boolean);
  // Et nøkkelord treffer når et ord i beskrivelsen starter med det («kafeer» treffer «kafe»), ikke midt i et ord.
  const mentions = (keyword: string) => {
    const k = fold(keyword);
    return k.includes(" ") ? text.includes(k) : tokens.some((t) => t.startsWith(k));
  };
  if (kode) {
    let best: { m: BransjeMatch; length: number } | null = null;
    for (const genre of genres) {
      for (const bransje of genre.bransjer) {
        for (const prefix of bransje.nace ?? []) {
          if (kode.startsWith(prefix) && (!best || prefix.length > best.length)) {
            const m = match(genre, bransje);
            if (m) best = { m, length: prefix.length };
          }
        }
      }
    }
    let bestGenre: { genre: Genre; length: number } | null = null;
    for (const genre of genres) {
      for (const prefix of genre.nace) {
        if (kode.startsWith(prefix) && (!bestGenre || prefix.length > bestGenre.length)) bestGenre = { genre, length: prefix.length };
      }
    }
    // Et presist kodetreff på bransjen vinner. Ellers velger ordene i beskrivelsen innenfor sjangeren.
    if (best && (!bestGenre || best.length >= bestGenre.length)) return best.m;
    if (bestGenre) {
      const byWord = bestGenre.genre.bransjer.find((b) => b.keywords.some(mentions));
      return match(bestGenre.genre, byWord ?? bestGenre.genre.bransjer[0]);
    }
  }
  return text ? (searchBransjer(description, 1)[0] ?? null) : null;
}
