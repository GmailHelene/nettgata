import { describe, expect, it } from "vitest";
import { validatePageContent } from "@/lib/content/registry";
import type { PageContent } from "@/lib/content/types";
import { readSiteInfo } from "@/lib/site-info";
import {
  angreskjema,
  BESTILL_KNAPP,
  bestillKnapp,
  kasseTekster,
  lagAngrerettside,
  ordrebekreftelseTekster,
  STANDARD_UNNTAK,
} from "@/lib/legal/angrerett";
import { JURIDISK_GODKJENT, juridiskeMangler, kort, norskDato, sideSomTekst, UTKAST_MERKNAD, type Virksomhet } from "@/lib/legal/felles";
import { lagPersonvernerklaering } from "@/lib/legal/personvern";
import { DBA_SIGNATUR, INFORMASJONSKAPSLER, plattformDokument, SAMTYKKEBANNER, type PlattformDokument } from "@/lib/legal/plattform";
import { UNDERLEVERANDORER, underleverandorAvsnitt } from "@/lib/legal/underleverandorer";

const demo: Virksomhet = {
  navn: "Demo Rør AS",
  mva: true,
  info: readSiteInfo({ phone: "900 00 000", email: "post@demo.no", street: "Storgata 1", postalCode: "3340", city: "Åmot", orgnr: "123456785" }),
};
const tom: Virksomhet = { navn: "Tom Butikk", info: readSiteInfo({}) };

const nettside = (utkast?: boolean) => lagPersonvernerklaering({ virksomhet: demo, type: "nettside", utkast });
const nettbutikk = lagPersonvernerklaering({
  virksomhet: demo,
  type: "nettbutikk",
  betalingsmater: ["vipps", "kort", "klarna", "faktura", "ved-henting", "test"],
  nyhetsbrev: true,
});
const angreside = lagAngrerettside({ butikk: demo, betalingsmater: ["vipps", "kort"], leveringstid: "2-5 virkedager" });
const dokumenter: PlattformDokument[] = ["personvern", "vilkar", "databehandleravtale"];

/** All tekst på en side, også tittel og beskrivelse for Google. */
function tekst(innhold: PageContent): string {
  const props = innhold.sections.flatMap((s) => Object.values(s.props).filter((v): v is string => typeof v === "string"));
  return [innhold.seo.title ?? "", innhold.seo.description ?? "", ...props].join("\n");
}

const ider = (innhold: PageContent) => innhold.sections.map((s) => s.id);

/** All tekst modulene lager, så stilsjekkene treffer alt en kunde eller besøkende kan se. */
function alleTekster(): [string, string][] {
  const kasse = kasseTekster({ butikk: demo, betalingsmater: ["vipps", "kort", "ved-henting"] });
  return [
    ["personvern nettside", tekst(nettside())],
    ["personvern nettbutikk", tekst(nettbutikk)],
    ["angrerett", tekst(angreside)],
    ["angrerett, butikken betaler retur", tekst(lagAngrerettside({ butikk: demo, returfrakt: "butikken", garanti: "To års garanti på pumper" }))],
    ["angrerett uten kontaktinfo", tekst(lagAngrerettside({ butikk: tom }))],
    ["personvern uten kontaktinfo", tekst(lagPersonvernerklaering({ virksomhet: tom, type: "nettbutikk", bring: false }))],
    ...dokumenter.map((d): [string, string] => [`nettgata.no/${d}`, tekst(plattformDokument(d))]),
    ["kassen", [kasse.start, kasse.personvern, kasse.forKnappen, kasse.vilkar, kasse.knapp].join("\n")],
    ["ordrebekreftelsen", ordrebekreftelseTekster({ butikk: demo, leveringstid: "2-5 virkedager" }).tekst],
    ["samtykkebanneret", Object.values(SAMTYKKEBANNER).join("\n")],
    ["informasjonskapsler", INFORMASJONSKAPSLER.flatMap((l) => [l.navn, l.hvem, l.formal, l.varighet]).join("\n")],
    ["underleverandører", UNDERLEVERANDORER.map(underleverandorAvsnitt).join("\n")],
    ["signatur", DBA_SIGNATUR.flatMap((s) => [s.part, ...s.felt.flatMap((f) => [f.etikett, f.verdi ?? ""])]).join("\n")],
    ["mangler", juridiskeMangler(tom, { nettbutikk: true }).join("\n")],
    ["utkast", UTKAST_MERKNAD],
  ];
}

/** Ord der æ, ø eller å er skrevet som ae, oe eller aa. */
function translitterert(tekst: string): string[] {
  // Ekte sammensatte ord med «aa». Nye ord legges til her med vilje, så sjekken heller tar for mye enn for lite.
  const lovlige = new Set(["fakturaadresse", "fakturaadressen"]);
  const kjenteFeil = /^(paa|naar|foer|gjoer|goer|saa|maa|faa|ogsaa|naer|vaere|aerlig|personvernerklaering)$/;
  return (tekst.toLowerCase().match(/[a-zæøå]+/g) ?? []).filter((ord) => {
    if (lovlige.has(ord)) return false;
    if (kjenteFeil.test(ord) || ord.includes("aa")) return true;
    // «ae» og «oe» er riktig når en a- eller o-stamme bare har fått bøyning: skjemaet, dataene, studioet, kontoen, noe.
    return [...ord.matchAll(/[ao]e/g)].some((m) => !/^(e|en|er|et|ene|es)$/.test(ord.slice(m.index + 1)));
  });
}

describe("juridiske sider er gyldig innhold", () => {
  const sider: [string, PageContent][] = [
    ["personvern nettside", nettside()],
    ["personvern nettbutikk", nettbutikk],
    ["personvern uten kontaktinfo", lagPersonvernerklaering({ virksomhet: tom, type: "nettbutikk" })],
    ["angrerett", angreside],
    ["angrerett uten unntak og kontaktinfo", lagAngrerettside({ butikk: tom, unntak: [] })],
    ...dokumenter.map((d): [string, PageContent] => [d, plattformDokument(d)]),
    ...dokumenter.map((d): [string, PageContent] => [`${d} godkjent`, plattformDokument(d, { utkast: false })]),
  ];

  it.each(sider)("%s kan publiseres", (_navn, innhold) => {
    const resultat = validatePageContent(innhold, "publish");
    expect(resultat.ok ? [] : resultat.errors).toEqual([]);
  });

  it.each(sider)("%s har én hovedoverskrift øverst", (_navn, innhold) => {
    expect(innhold.sections.length).toBeGreaterThan(1);
    for (const s of innhold.sections) {
      expect(s.type).toBe("tekst");
      expect(String(s.props.overskrift ?? "")).not.toBe("");
    }
  });
});

describe("personvernerklæringen følger nettstedet", () => {
  it("nettside uten butikk nevner ikke handel, betaling eller frakt", () => {
    const innhold = nettside();
    for (const id of ["handel", "betaling", "frakt", "nyhetsbrev"]) expect(ider(innhold)).not.toContain(id);
    expect(tekst(innhold)).not.toMatch(/handlekurv|Vipps|Klarna|Posten Bring|bokføringsloven/i);
    expect(tekst(innhold)).toContain("Når du sender oss en melding");
  });

  it("nettbutikk får handel, betalingsmåtene som er på, frakt og nyhetsbrev", () => {
    const t = tekst(nettbutikk);
    for (const id of ["handel", "betaling", "frakt", "nyhetsbrev"]) expect(ider(nettbutikk)).toContain(id);
    expect(t).toContain("Handlekurven lagres i nettleseren");
    expect(t).toContain("Vipps MobilePay AS");
    expect(t).toContain("Klarna Bank AB");
    expect(t).toContain("automatisk kredittvurdering");
    expect(t).toContain("Posten Bring AS");
    expect(t).toContain("fem år etter utgangen av regnskapsåret");
    expect(t).not.toMatch(/testbetaling/i);
  });

  it("tar bare med betalingsmåtene som er slått på", () => {
    const t = tekst(lagPersonvernerklaering({ virksomhet: demo, type: "nettbutikk", betalingsmater: ["ved-henting"], bring: false }));
    expect(t).not.toMatch(/Vipps|Klarna|kredittvurdering|Posten Bring/);
    expect(t).toContain("Betaler du når du henter varene");
    expect(t).toContain("fraktselskapet");
  });

  it("dropper skjema og AI når de er slått av", () => {
    const innhold = lagPersonvernerklaering({ virksomhet: demo, type: "nettside", kontaktskjema: false, ai: false });
    expect(ider(innhold)).not.toContain("henvendelser");
    expect(tekst(innhold)).not.toContain("Anthropic");
  });

  it("viser kunden som behandlingsansvarlig og Nettgata som databehandler", () => {
    const t = tekst(nettside());
    expect(t).toContain("Behandlingsansvarlig er Demo Rør AS, org.nr. 123 456 785 MVA, Storgata 1, 3340 Åmot.");
    expect(t).toContain("e-post post@demo.no eller telefon 900 00 000");
    expect(t).toContain("Grønberg Tech Solutions (org.nr. 927 889 404)");
    expect(t).toContain("databehandleravtale");
  });
});

describe("utkastmerknaden", () => {
  it("er borte når Helene har godkjent tekstene, men kan fortsatt slås på for et utkast", () => {
    expect(JURIDISK_GODKJENT).toBe(true);
    expect(tekst(nettside())).not.toContain(UTKAST_MERKNAD);
    const [forste] = sideSomTekst(nettside(true));
    expect(forste.overskrift).toBe("Personvernerklæring");
    expect(forste.avsnitt[0]).toBe(UTKAST_MERKNAD);
  });

  it("viser adressen til Nettgata i de juridiske tekstene", () => {
    expect(tekst(plattformDokument("personvern"))).toContain("Stadionveien 1A, 3340 Åmot");
  });
});

describe("angrerett for nettbutikker", () => {
  it("har standard angreskjema med butikkens navn, adresse og e-post", () => {
    const linjer = angreskjema(demo);
    expect(linjer).toContain("Utfylt skjema sendes til: Demo Rør AS, Storgata 1, 3340 Åmot, post@demo.no");
    expect(linjer.join("\n")).toContain("Jeg/vi underretter herved om at jeg/vi ønsker å gå fra min/vår avtale om kjøp av følgende");
    expect(tekst(angreside)).toContain("Forbrukerens/forbrukernes underskrift (dersom papirskjema benyttes)");
  });

  it("har det kunden skal vite før kjøpet", () => {
    const t = tekst(angreside);
    expect(t).toContain("14 dagers angrerett");
    expect(t).toContain("Du kan betale med Vipps eller kort.");
    expect(t).toContain("Vi sender bare til adresser i Norge.");
    expect(t).toContain("Vi sender varene innen 2-5 virkedager.");
    expect(t).toContain("Du betaler selv returfrakten.");
    expect(t).toContain("Forbrukertilsynet");
    expect(t).not.toMatch(/ec\.europa\.eu\/odr|klageportal/i);
    for (const id of ["angre-unntak", "angreskjema", "reklamasjon", "for-du-bestiller", "selger"]) expect(ider(angreside)).toContain(id);
  });

  it("følger valgene for retur, unntak og garanti", () => {
    const innhold = lagAngrerettside({ butikk: demo, returfrakt: "butikken", unntak: [], garanti: "To års garanti på pumper" });
    const t = tekst(innhold);
    expect(t).toContain("Vi betaler returfrakten.");
    expect(t).toContain("I tillegg gir vi denne garantien: To års garanti på pumper.");
    expect(ider(innhold)).not.toContain("angre-unntak");
    expect(STANDARD_UNNTAK.length).toBe(4);
  });

  it("gir kassen korte tekster og riktig knapp", () => {
    const kasse = kasseTekster({ butikk: demo, betalingsmater: ["vipps", "kort", "ved-henting"] });
    expect(kasse.knapp).toBe(BESTILL_KNAPP);
    expect(bestillKnapp("1 299 kr")).toBe("Bestill med plikt til å betale 1 299 kr");
    expect(kasse.start).toBe("Du kan betale med Vipps eller kort, eller når du henter varene. Vi sender bare til adresser i Norge.");
    expect(kasse.forKnappen).toContain("Du kjøper fra Demo Rør AS, org.nr. 123 456 785 MVA.");
    expect(kasse.forKnappen).toContain("14 dagers angrerett");
    expect(kasse.lenker.angrerett).toBe("/angrerett");
  });

  it("ordrebekreftelsen har angrerett og angreskjema i selve e-posten", () => {
    const bekreftelse = ordrebekreftelseTekster({ butikk: demo, leveringstid: "2-5 virkedager" });
    expect(bekreftelse.avsnitt[0]).toBe("Vi sender varene innen 2-5 virkedager.");
    expect(bekreftelse.tekst).toContain("Angreskjema");
    expect(bekreftelse.tekst).toContain(angreskjema(demo)[2]);
    expect(bekreftelse.tekst).toContain("Du har handlet hos Demo Rør AS, org.nr. 123 456 785 MVA");
    expect(bekreftelse.tekst).toContain("fem år hvis den er ment å vare vesentlig lenger");
  });
});

describe("nettgata.no", () => {
  it("personvernerklæringen dekker besøk, Google Ads med samtykke, konto og fakturering", () => {
    const t = tekst(plattformDokument("personvern"));
    for (const del of ["Grønberg Tech Solutions", "927 889 404", "business.safety.google/privacy", "_gcl_au", "nettgata-samtykke", "Stripe", "Datatilsynet"]) {
      expect(t).toContain(del);
    }
  });

  it("vilkårene har de vedtatte prisene og domenet i kundens navn", () => {
    const t = tekst(plattformDokument("vilkar"));
    for (const del of ["199 kroner", "169 kroner", "399 kroner", "339 kroner", "249 kroner", "3 900 kroner", "9 900 kroner", "deg som innehaver"]) {
      expect(t).toContain(del);
    }
  });

  it("databehandleravtalen lister alle underleverandørene", () => {
    const t = tekst(plattformDokument("databehandleravtale"));
    for (const u of UNDERLEVERANDORER) expect(t).toContain(u.selskap);
    expect(t).toContain("senest innen 48 timer");
  });

  it("banneret har like enkel nei som ja", () => {
    expect(SAMTYKKEBANNER.nei).not.toBe("");
    expect(SAMTYKKEBANNER.tekst).toContain("Google");
    expect(INFORMASJONSKAPSLER.filter((l) => !l.nodvendig).every((l) => l.hvem === "Google")).toBe(true);
  });
});

describe("skrivestil", () => {
  it.each(alleTekster())("%s har ingen tankestrek", (_navn, t) => {
    expect(t).not.toMatch(/[‒–—―]/);
    expect(t).not.toMatch(/ - /);
  });

  it.each(alleTekster())("%s bruker ekte æ, ø og å", (_navn, t) => {
    expect(translitterert(t)).toEqual([]);
    expect(t).toMatch(/[æøå]/);
  });

  it.each(alleTekster())("%s har ingen AI-klisjeer", (_navn, t) => {
    const klisjeer = [/det er viktig å merke seg/i, /i dagens samfunn/i, /avslutningsvis/i, /dykke ned i/i, /i en verden hvor/i, /når alt kommer til alt/i];
    for (const k of klisjeer) expect(t).not.toMatch(k);
  });

  it("fanger feilstavingene sjekken skal fange", () => {
    expect(translitterert("Les personvernerklaeringen paa siden")).toEqual(["personvernerklaeringen", "paa"]);
    expect(translitterert("Skjemaet, dataene og fakturaadressen i studioet er noe vi har")).toEqual([]);
    expect(translitterert("Vi maa vaere aerlige naar vi svarer")).toEqual(["maa", "vaere", "aerlige", "naar"]);
  });
});

describe("hjelpere", () => {
  it("skriver norsk dato og kutter ved helt ord", () => {
    expect(norskDato("2026-11-01")).toBe("1. november 2026");
    const tittel = "Personvernerklæring | Et svært langt firmanavn som ikke får plass";
    expect(kort(tittel, 30)).toBe("Personvernerklæring | Et svært");
    expect(kort(tittel, 28)).toBe("Personvernerklæring | Et");
    expect(kort(tittel, 21)).toBe("Personvernerklæring");
    expect(kort("Kort", 70)).toBe("Kort");
  });

  it("sier hva som mangler i Innstillinger", () => {
    expect(juridiskeMangler(demo, { nettbutikk: true })).toEqual([]);
    expect(juridiskeMangler(tom, { nettbutikk: false })).toHaveLength(3);
    expect(juridiskeMangler(tom, { nettbutikk: true })).toHaveLength(4);
  });
});
