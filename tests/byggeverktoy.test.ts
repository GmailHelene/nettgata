import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgliteDb } from "@/db/pglite";
import { demoFrontpage, demoTheme } from "@/db/demo";
import { auditLog, organizations, pages, sites, users } from "@/db/schema";
import { historyReducer, initHistory, GROUP_MS, HISTORY_LIMIT, type Doc } from "@/app/studio/nettsted/[siteId]/side/[pageId]/editor-history";
import { exampleSection, hasExampleText, newSection } from "@/lib/content/examples";
import { EXAMPLE_IMAGE_SRC } from "@/lib/content/fields";
import { sectionProblems, sectionRegistry, validatePageContent } from "@/lib/content/registry";
import { sectionTypes, type Section } from "@/lib/content/types";
import { publishPage, saveDraft } from "@/lib/publishing";

const page = (...sections: Section[]) => ({ seo: {}, sections });
const doc = (title: string): Doc => ({ title, content: page() });

describe("angre og gjør om", () => {
  it("slår sammen tastetrykk i samme seksjon, men ikke etter en pause", () => {
    let h = initHistory(doc(""));
    h = historyReducer(h, { type: "edit", doc: doc("H"), key: "seksjon:a", at: 1000 });
    h = historyReducer(h, { type: "edit", doc: doc("He"), key: "seksjon:a", at: 1200 });
    h = historyReducer(h, { type: "edit", doc: doc("Hei"), key: "seksjon:a", at: 1400 });
    expect(h.past.map((d) => d.title)).toEqual([""]);
    h = historyReducer(h, { type: "edit", doc: doc("Hei!"), key: "seksjon:a", at: 1400 + GROUP_MS });
    expect(h.past.map((d) => d.title)).toEqual(["", "Hei"]);
  });

  it("flytting og sletting blir alltid egne steg", () => {
    let h = initHistory(doc("a"));
    h = historyReducer(h, { type: "edit", doc: doc("b"), key: null, at: 1 });
    h = historyReducer(h, { type: "edit", doc: doc("c"), key: null, at: 2 });
    expect(h.past.map((d) => d.title)).toEqual(["a", "b"]);
  });

  it("angrer, gjør om, og glemmer «gjør om» etter en ny endring", () => {
    let h = initHistory(doc("a"));
    h = historyReducer(h, { type: "edit", doc: doc("b"), key: null, at: 1 });
    h = historyReducer(h, { type: "undo" });
    expect(h.present.title).toBe("a");
    h = historyReducer(h, { type: "redo" });
    expect(h.present.title).toBe("b");
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "edit", doc: doc("x"), key: null, at: 2 });
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
    // Skriving rett etter angre slås ikke sammen med det som var før.
    const typed = historyReducer(historyReducer(h, { type: "undo" }), { type: "edit", doc: doc("y"), key: "tittel", at: 3 });
    expect(typed.past.map((d) => d.title)).toEqual(["a"]);
  });

  it("husker høyst HISTORY_LIMIT steg", () => {
    let h = initHistory(doc("0"));
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: "edit", doc: doc(String(i)), key: null, at: i });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].title).toBe("20");
  });
});

describe("seksjonsbiblioteket", () => {
  const all = sectionTypes.flatMap((type) => sectionRegistry[type].variants.map((v) => ({ type, variant: v.key })));

  it("alle seksjoner har forklaring, og alle eksempler kan lagres som kladd", () => {
    for (const { type, variant } of all) {
      expect(sectionRegistry[type].description, type).toBeTruthy();
      const section = exampleSection(type, variant);
      expect(sectionProblems(section, "draft"), `${type}/${variant}`).toEqual([]);
    }
  });

  it("eksempelbilder kan stå i kladden, men stopper publisering med en tydelig beskjed", () => {
    const section = exampleSection("bildetekst", "bilde-venstre");
    expect(validatePageContent(page(section), "draft").ok).toBe(true);
    const result = validatePageContent(page(section));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.message)).toEqual(["Bilde og tekst: Bilde: bytt ut eksempelbildet med et eget bilde"]);
  });

  it("toppseksjon uten bildevariant får ikke et usynlig eksempelbilde", () => {
    expect(exampleSection("hero", "standard").props.bilde).toBeNull();
    expect((exampleSection("hero", "bilde").props.bilde as { src: string }).src).toBe(EXAMPLE_IMAGE_SRC);
    const hero = newSection("hero", "sentrert", "h", ["/kontakt"]);
    expect(sectionProblems(hero)).toEqual([]);
  });

  it("kundeomtaler settes inn uten omtaler, så ingenting oppdiktet kan publiseres", () => {
    expect((exampleSection("omtaler", "standard").props.omtaler as unknown[]).length).toBeGreaterThan(0);
    expect(newSection("omtaler", "standard", "o", []).props.omtaler).toEqual([]);
  });

  it("fjerner lenker til sider som ikke finnes", () => {
    const hero = newSection("hero", "standard", "h", ["/"]);
    expect([hero.props.knappTekst, hero.props.knappLenke]).toEqual(["", ""]);
    // Påkrevd knapp: teksten står, lenken må fylles ut før publisering.
    const cta = newSection("cta", "standard", "c", ["/"]);
    expect([cta.props.knappTekst, cta.props.knappLenke]).toEqual(["Ta kontakt", ""]);
    expect(sectionProblems(cta)).toEqual(["Knappelenke må fylles ut"]);
    expect(newSection("cta", "standard", "c", ["/kontakt"]).props.knappLenke).toBe("/kontakt");
    const cards = newSection("kategorikort", "rutenett", "k", ["/produkter"]).props.kort as { lenke: string }[];
    expect(cards.every((c) => c.lenke === "/produkter")).toBe(true);
  });

  it("kjenner igjen eksempeltekst til den er byttet ut", () => {
    const hero = newSection("hero", "standard", "h", []);
    expect(hasExampleText(hero)).toBe(true);
    expect(hasExampleText({ ...hero, props: { ...hero.props, overskrift: "Rørlegger i Modum", undertekst: "Vi tar små og store jobber." } })).toBe(false);
    // Fornuftige standardtekster som «Utvalgte varer» skal ikke gi varsel.
    expect(hasExampleText(newSection("produkter", "standard", "p", []))).toBe(false);
  });

  it("eksempeltekstene har ingen tankestreker", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Array.isArray(value) || (value && typeof value === "object") ? Object.values(value).flatMap(strings) : [];
    for (const { type, variant } of all) {
      for (const text of strings(exampleSection(type, variant).props)) expect(text, type).not.toMatch(/[–—]| - /);
    }
    for (const def of Object.values(sectionRegistry)) expect(`${def.description} ${def.hint ?? ""}`).not.toMatch(/[–—]| - /);
  });
});

describe("kladd som lagres automatisk", () => {
  it("skriver høyst én linje i loggen per kvarter, uansett hvor ofte den lagres", async () => {
    const db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Demo", slug: "demo", industryPack: "handverker", theme: demoTheme })
      .returning();
    const [first] = await db.insert(pages).values({ siteId: site.id, path: "/", title: "Forside", draft: demoFrontpage }).returning();
    const [second] = await db.insert(pages).values({ siteId: site.id, path: "/om", title: "Om", draft: demoFrontpage }).returning();

    for (let i = 0; i < 3; i++) await saveDraft(db, first.id, { title: `Forside ${i}`, content: demoFrontpage }, user.id);
    await saveDraft(db, second.id, { title: "Om oss", content: demoFrontpage }, user.id);
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.siteId, site.id), eq(auditLog.action, "page.draft_saved")));
    expect(rows.map((r) => r.detail?.pageId).sort()).toEqual([first.id, second.id].sort());

    // En kladd med eksempelbilde kan lagres, men ikke publiseres.
    const withExample = page(exampleSection("galleri", "rutenett", "g"));
    await saveDraft(db, first.id, { title: "Forside", content: withExample }, user.id);
    await expect(publishPage(db, first.id, user.id)).rejects.toThrow(/eksempelbildet/);
  });
});
