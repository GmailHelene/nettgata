import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { articleText, getHelpArticle, helpArticles, helpCategories, searchHelp } from "@/lib/hjelp/artikler";
import { readme } from "@/lib/eksport/innhold";
import type { sites } from "@/db/schema";

const slugs = (query: string) => searchHelp(query).map((a) => a.slug);

/** Alle .ts- og .tsx-filer under en mappe. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * æ, ø og å skrevet som ae, oe og aa. «aa» finnes nesten aldri i ekte norske ord, så alle ord med aa fanges.
 * ae og oe kan være riktig i sammensatte ord (dataene, studioet), så der sjekkes de vanlige feilene i stedet.
 */
const TRANSLITERATED =
  /\b(?:[a-z]*aa[a-z]*|vaere?|naer[a-z]*|saerlig|laer[a-z]*|foer[a-z]*|goer|gjoer[a-z]*|boer|moete[a-z]*|hoey[a-z]*|stoerre|k[j]?oep[a-z]*|loesning[a-z]*|soek[a-z]*|doegn[a-z]*|noekkel[a-z]*|foelg[a-z]*|oensk[a-z]*|besoek[a-z]*|personvernerklaer[a-z]*|spoersmaal[a-z]*)\b/gi;
function misspelled(text: string): string[] {
  return text.match(TRANSLITERATED) ?? [];
}

/** Tankestrek: em og en dash, og bindestrek med mellomrom på begge sider. */
const DASHES = /[–—]| - /;

describe("hjelpeartiklene", () => {
  it("har mellom 20 og 40 artikler, unike adresser og kjente kategorier", () => {
    expect(helpArticles.length).toBeGreaterThanOrEqual(20);
    expect(helpArticles.length).toBeLessThanOrEqual(40);
    expect(new Set(helpArticles.map((a) => a.slug)).size).toBe(helpArticles.length);
    for (const a of helpArticles) {
      expect(a.slug).toMatch(/^[a-z0-9-]+$/);
      expect(Object.keys(helpCategories)).toContain(a.category);
      expect(a.steps?.length ?? 0, a.slug).toBeGreaterThan(0);
    }
  });

  it("dekker de vanlige spørsmålene", () => {
    for (const slug of ["kom-i-gang", "domenet-virker-ikke", "ordrebekreftelse", "bytt-kort", "si-opp", "last-ned-alt", "vipps-klarna", "booking", "nyhetsbrev"]) {
      expect(getHelpArticle(slug), slug).not.toBeNull();
    }
  });

  it("lenker bare til artikler som finnes", () => {
    for (const a of helpArticles) for (const r of a.related ?? []) expect(getHelpArticle(r), `${a.slug} -> ${r}`).not.toBeNull();
    // «Les mer»-lenkene i studioet: <HelpLink slug="..."> og article="..." på PageIntro og HowTo.
    const used = sourceFiles(join(process.cwd(), "app"))
      .concat(sourceFiles(join(process.cwd(), "components")))
      .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/<(?:HelpLink|PageIntro|HowTo)\b[^>]*?\b(?:slug|article)="([^"]+)"/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(10);
    for (const slug of used) expect(getHelpArticle(slug), slug).not.toBeNull();
  });

  it("har ekte æ, ø og å og ingen tankestrek", () => {
    for (const a of helpArticles) {
      const text = articleText(a);
      expect(text, a.slug).not.toMatch(DASHES);
      expect(misspelled(text), a.slug).toEqual([]);
    }
  });

  it("nevner ikke det som ikke er bygget", () => {
    const all = helpArticles.map(articleText).join("\n");
    expect(all).not.toMatch(/Fiken/);
    expect(all).not.toMatch(/\bMeta\b/);
    expect(all).not.toMatch(/foreslå[rt]? alt-tekst|alt-tekst fra AI|AI.{0,30}alt-tekst/i);
    // Skriftlig kontakt, aldri «ring oss».
    expect(all).not.toMatch(/\bring (oss|meg)\b/i);
  });

  it("hjelpetekstene i studioet har heller ingen tankestrek eller ae/oe/aa", () => {
    const files = [
      "components/studio/help.tsx",
      "app/studio/hjelp/page.tsx",
      "app/studio/hjelp/[slug]/page.tsx",
      "app/studio/hjelp/help-search.tsx",
      "app/studio/hjelp/contact.tsx",
      "app/studio/nettsted/[siteId]/innstillinger/export-section.tsx",
    ];
    for (const file of files) {
      // Bare teksten i JSX og strenger, ikke kode: alt mellom > og <, og innholdet i "..." med mellomrom i.
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const visible = [...source.matchAll(/>([^<>{}]+)</g), ...source.matchAll(/"([^"]* [^"]*)"/g)].map((m) => m[1]).join("\n");
      expect(visible, file).not.toMatch(/[–—]/);
      expect(misspelled(visible), file).toEqual([]);
    }
  });

  it("LES-MEG i eksporten følger de samme reglene", () => {
    const site = { name: "Salong Test", kind: "nettbutikk" } as typeof sites.$inferSelect;
    const text = new TextDecoder().decode(readme({ site, createdAt: new Date("2026-11-02T10:00:00Z"), files: ["tabeller/varer.csv"], pages: 3, skipped: ["/gammel"] }));
    expect(text).toMatch(/personopplysninger/);
    expect(text).toMatch(/behandlingsansvarlig/);
    expect(text).toMatch(/\/gammel/);
    expect(text).not.toMatch(DASHES);
    expect(misspelled(text)).toEqual([]);
  });
});

describe("søk i hjelpen", () => {
  it("tomt søk gir alle artiklene i vanlig rekkefølge", () => {
    expect(searchHelp("")).toEqual(helpArticles);
    expect(searchHelp("   ")).toEqual(helpArticles);
  });

  it("finner på starten av ord, uansett store bokstaver", () => {
    expect(slugs("domene")[0]).toBe("domene");
    expect(slugs("domene")).toContain("domenet-virker-ikke");
    expect(slugs("NYHETS")[0]).toBe("nyhetsbrev");
    expect(slugs("bytte kort")).toContain("bytt-kort");
  });

  it("treff i tittelen kommer foran treff i teksten", () => {
    const results = slugs("kort");
    expect(results[0]).toBe("bytt-kort");
    expect(results.length).toBeGreaterThan(1);
  });

  it("alle ordene må finnes", () => {
    expect(slugs("si opp")).toContain("si-opp");
    expect(slugs("vipps klarna")[0]).toBe("vipps-klarna");
    expect(slugs("vipps dinosaur")).toEqual([]);
  });

  it("forstår æ, ø og å, og tegn som anførselstegn", () => {
    expect(slugs("forhåndsvis")).toContain("publisere");
    expect(slugs("«ordrebekreftelsen»")).toContain("ordrebekreftelse");
    expect(slugs("søppelpost")).toEqual(["ordrebekreftelse"]);
  });
});
