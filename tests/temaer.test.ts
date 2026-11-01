import { describe, expect, it } from "vitest";
import { contrastRatio, resolveTheme, themeContrastProblems, themeRootProps, themeSchema, type Theme } from "@/lib/theme";
import { genres, searchBransjer, suggestFromBrreg } from "@/lib/genres";
import { packs } from "@/lib/packs";
import { buildTheme, presetOf, themes } from "@/lib/themes";

describe("temaene", () => {
  it("har unike nøkler, og hvert tema har minst tre fargevarianter", () => {
    expect(new Set(themes.map((t) => t.key)).size).toBe(themes.length);
    for (const def of themes) {
      expect(def.palettes.length, def.key).toBeGreaterThanOrEqual(3);
      expect(new Set(def.palettes.map((x) => x.key)).size, def.key).toBe(def.palettes.length);
    }
  });

  it("holder WCAG 2.0 AA i alle fargevariantene, også med temaets egne knapper", () => {
    for (const def of themes) {
      for (const palette of def.palettes) {
        const theme = buildTheme(def.key, palette.key)!;
        expect(themeSchema.safeParse(theme).success, `${def.key}/${palette.key}`).toBe(true);
        expect(themeContrastProblems(theme), `${def.key}/${palette.key}`).toEqual([]);
      }
    }
  });

  it("har pyntefarger som synes mot bakgrunnen", () => {
    // Pynten er ikke tekst, men en strek eller ramme ingen ser, er bortkastet. 1.6:1 er en nedre grense for at den synes.
    for (const def of themes) {
      for (const palette of def.palettes) {
        expect(contrastRatio(palette.colors.accent, palette.colors.background), `${def.key}/${palette.key}`).toBeGreaterThanOrEqual(1.6);
      }
    }
  });

  it("husker hvilket tema og hvilken variant et lagret tema kom fra", () => {
    const theme = buildTheme("atelier", "salvie")!;
    expect(presetOf(theme)).toMatchObject({ def: { key: "atelier" }, palette: { key: "salvie" } });
    expect(buildTheme("finnes-ikke")).toBeNull();
    // Ukjent variant gir temaets første.
    expect(buildTheme("fjord", "finnes-ikke")?.preset).toEqual({ theme: "fjord", palette: "fjordbla" });
  });
});

describe("temamotoren", () => {
  const old: Theme = {
    primary: "#0b4f6c",
    onPrimary: "#ffffff",
    background: "#ffffff",
    surface: "#eef4f7",
    text: "#14202b",
    muted: "#4a5a68",
    fonts: "robust",
    radius: "myk",
  };

  it("viser nettsteder fra før temaene kom akkurat som før", () => {
    const resolved = resolveTheme(old);
    expect(resolved).toMatchObject({ buttons: "fylt", cards: "flate", header: "klassisk", spacing: "normal", accent: old.primary });
    const root = themeRootProps(old);
    expect(root["data-knapper"]).toBe("fylt");
    expect(root["data-mork"]).toBeUndefined();
    expect(root.style).toMatchObject({ "--c-primary": "#0b4f6c", "--radius": "8px", "--space": "1", "--h-scale": "1" });
  });

  it("tåler ødelagte verdier felt for felt", () => {
    const broken = { ...old, primary: "rød", buttons: "glitter", fonts: "comic" } as unknown as Theme;
    const resolved = resolveTheme(broken);
    expect(resolved.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolved.buttons).toBe("fylt");
    expect(resolved.fonts).toBe("moderne");
    expect(resolved.text).toBe(old.text);
  });

  it("merker mørke temaer, så skjemafelt følger etter", () => {
    expect(themeRootProps(buildTheme("nordlys", "nordlys")!)["data-mork"]).toBe("");
    expect(themeRootProps(buildTheme("nordlys", "isbre")!)["data-mork"]).toBeUndefined();
  });

  it("krever kontrast på knappefargen når knappene har omriss", () => {
    const pale = { ...old, primary: "#9ccbe0", onPrimary: "#14202b", buttons: "omriss" as const };
    expect(themeContrastProblems({ ...pale, buttons: "fylt" })).toEqual([]);
    expect(themeContrastProblems(pale).join(" ")).toMatch(/Knappefarge mot bakgrunn/);
  });
});

describe("sjangre og bransjer", () => {
  it("peker bare på pakker som finnes, og alle pakker ligger i en sjanger", () => {
    const listed = genres.flatMap((g) => g.bransjer.map((b) => b.pack));
    for (const key of listed) expect(packs[key], key).toBeDefined();
    expect(new Set(listed).size).toBe(listed.length);
    for (const key of Object.keys(packs)) expect(listed, key).toContain(key);
  });

  it("foreslår bransje ut fra næringskoden i Brreg", () => {
    const pick = (code: string, text = "") => suggestFromBrreg(code, text)?.bransje.pack;
    expect(pick("43.221", "Rørleggerarbeid")).toBe("rorlegger");
    expect(pick("43.210", "Elektrisk installasjonsarbeid")).toBe("elektriker");
    expect(pick("96.021", "Frisering")).toBe("frisor");
    expect(pick("56.101", "Drift av restauranter og kafeer")).toBe("restaurant");
    expect(pick("86.230", "Tannhelsetjenester")).toBe("tannlege");
    // Kodene i helse deler start, så ordene i beskrivelsen velger bransjen.
    expect(pick("86.909", "Andre helsetjenester, kiropraktor")).toBe("kiropraktor");
    expect(pick("93.120", "Drift av idrettslag og klubber")).toBe("idrettslag");
    expect(pick("93.130", "Drift av treningssentre")).toBe("treningssenter");
    expect(pick("62.010", "Programmeringstjenester")).toBe("it");
    expect(pick("47.910", "Postordrehandel og handel via Internett")).toBe("nettbutikk");
    // Ukjent kode, men kjente ord.
    expect(pick("", "Fotografvirksomhet")).toBe("fotograf");
    expect(pick("99.999", "")).toBeUndefined();
  });

  it("finner bransjer med og uten æ, ø og å", () => {
    expect(searchBransjer("frisør")[0]?.bransje.pack).toBe("frisor");
    expect(searchBransjer("frisor")[0]?.bransje.pack).toBe("frisor");
    expect(searchBransjer("rørlegger")[0]?.bransje.pack).toBe("rorlegger");
    expect(searchBransjer("hytte")[0]?.bransje.pack).toBe("overnatting");
    expect(searchBransjer("yoga")[0]?.bransje.pack).toBe("yoga");
    expect(searchBransjer("x")).toEqual([]);
  });
});
