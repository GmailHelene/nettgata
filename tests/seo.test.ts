import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Heading } from "@/components/sections";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { organizations, sites, users } from "@/db/schema";
import { shopMeta } from "@/components/shop/pages";
import { exampleSection } from "@/lib/content/examples";
import { validatePageContent } from "@/lib/content/registry";
import { effectiveTitle, firstContentImage, seoHints, shareImageSrc } from "@/lib/content/seo";
import type { PageContent, Section } from "@/lib/content/types";
import { createProduct } from "@/lib/shop/catalog";

const src = "/media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
const other = src.replace("2222-2222-4222-8222-222222222222", "3333-3333-4333-8333-333333333333");
const hero = (bilde: unknown = null): Section => ({ id: "h", type: "hero", variant: "bilde", props: { overskrift: "Rørlegger i Modum", bilde } });
const text: Section = { id: "t", type: "tekst", variant: "standard", props: { brodtekst: "Hei" } };
const page = (sections: Section[], seo: PageContent["seo"] = {}): PageContent => ({ seo, sections });
const hints = (content: PageContent, pageTitle = "Forside") => seoHints({ pageTitle, siteName: "Demo Rør AS", content });

describe("tittel og bilde for Google og deling", () => {
  it("bruker egen tittel, ellers «Sidetittel | Nettstedet»", () => {
    expect(effectiveTitle(undefined, "Om oss", "Demo Rør AS")).toBe("Om oss | Demo Rør AS");
    expect(effectiveTitle("   ", "Om oss", "Demo Rør AS")).toBe("Om oss | Demo Rør AS");
    expect(effectiveTitle(" Rørlegger i Modum ", "Om oss", "Demo Rør AS")).toBe("Rørlegger i Modum");
  });

  it("finner det første ekte bildet i rekkefølgen seksjonene står, også i lister", () => {
    const galleri: Section = { id: "g", type: "galleri", variant: "rutenett", props: { bilder: [{ bilde: { src: other, alt: "Bad" } }] } };
    expect(firstContentImage(page([text, galleri, hero({ src, alt: "Topp" })]))).toEqual({ src: other, alt: "Bad" });
    // Eksempelbilder fra biblioteket teller ikke.
    expect(firstContentImage(page([exampleSection("bildetekst", "bilde-venstre")]))).toBeNull();
    // Et bilde toppseksjonen ikke viser (sentrert eller venstrestilt), blir ikke delingsbildet.
    const hidden: Section = { ...hero({ src, alt: "Skjult" }), variant: "sentrert" };
    const shown: Section = { id: "b", type: "bildetekst", variant: "bilde-venstre", props: { brodtekst: "x", bilde: { src: other, alt: "Synlig" } } };
    expect(firstContentImage(page([hidden, shown]))).toEqual({ src: other, alt: "Synlig" });
    expect(firstContentImage(page([{ ...hidden, variant: "bakgrunn" }, shown]))).toEqual({ src, alt: "Skjult" });
    expect(firstContentImage(page([]))).toBeNull();
  });

  it("delingsbildet hentes i 1280 px, GIF i original", () => {
    expect(shareImageSrc(src)).toBe(src.replace(".webp", "-w1280.webp"));
    expect(shareImageSrc(src.replace(".webp", ".gif"))).toBe(src.replace(".webp", ".gif"));
  });
});

describe("«Fiks nå»", () => {
  it("en god side har ingenting å fikse", () => {
    expect(hints(page([hero({ src, alt: "Rørlegger på jobb" })], { description: "Rørlegger i Modum og Åmot. Bad, varme og lekkasjer, med fast pris." }))).toEqual([]);
  });

  it("sier fra når siden mangler hovedoverskrift, men ikke når første seksjon har en", () => {
    expect(hints(page([text], { description: "Noe" }))[0]).toMatch(/hovedoverskrift \(H1\)/);
    expect(hints(page([], { description: "Noe" }))[0]).toMatch(/hovedoverskrift/);
    const withHeading: Section = { ...text, props: { overskrift: "Om oss", brodtekst: "Hei" } };
    expect(hints(page([withHeading, hero({ src, alt: "x" })], { description: "Noe" }))).toEqual([]);
  });

  it("den første overskriften blir H1, uten å endre utseendet", () => {
    const heading = (props: { level?: 1 | 2; first?: boolean }, text: string) =>
      renderToStaticMarkup(createElement(Heading, props as ComponentProps<typeof Heading>, text));
    expect(heading({ first: true }, "Om oss")).toMatch(/^<h1 class="[^"]*text-3xl[^"]*">Om oss<\/h1>$/);
    expect(heading({}, "Mer")).toMatch(/^<h2 /);
    expect(heading({ level: 1 }, "Topp")).toMatch(/^<h1 class="[^"]*text-4xl/);
  });

  it("sier fra om manglende og for lang beskrivelse, og for lang tittel", () => {
    expect(hints(page([hero({ src, alt: "x" })])).join(" ")).toMatch(/Skriv en beskrivelse/);
    expect(hints(page([hero({ src, alt: "x" })], { description: "a".repeat(165) })).join(" ")).toMatch(/165 tegn/);
    const long = hints(page([hero({ src, alt: "x" })], { description: "Kort" }), "En svært lang sidetittel som ingen får plass til i Google");
    expect(long.join(" ")).toMatch(/Tittelen er \d+ tegn/);
  });

  it("ber om delingsbilde bare når siden ikke har noen bilder", () => {
    expect(hints(page([hero()], { description: "Noe" })).join(" ")).toMatch(/delingsbilde/);
    expect(hints(page([hero()], { description: "Noe", image: { src, alt: "" } })).join(" ")).not.toMatch(/delingsbilde/);
  });

  it("tåler eldre innhold uten seo", () => {
    expect(() => seoHints({ pageTitle: "Forside", siteName: "S", content: { sections: [hero()] } as unknown as PageContent })).not.toThrow();
  });
});

describe("validering av seo-feltene", () => {
  it("godtar et delingsbilde fra eget lager og gir norske feilmeldinger", () => {
    expect(validatePageContent(page([hero({ src, alt: "x" })], { image: { src, alt: "Bad" } })).ok).toBe(true);
    const bad = validatePageContent(page([hero({ src, alt: "x" })], { image: { src: "https://evil.example/x.png", alt: "" } }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toBe("Delingsbildet er ugyldig");
    const long = validatePageContent(page([hero({ src, alt: "x" })], { title: "a".repeat(71) }), "draft");
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0].message).toBe("Tittelen for Google kan ha maks 70 tegn");
  });
});

describe("delingsdata for varesiden", () => {
  it("bruker varens navn, en kort beskrivelse med hele ord og det første bildet", async () => {
    const db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Ullstua", slug: "ullstua", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme })
      .returning();
    const description = "Varm lue strikket i ull fra Hallingdal. ".repeat(8);
    await createProduct(
      db,
      site.id,
      {
        name: "Strikket lue",
        description,
        vatRate: 25,
        status: "active",
        images: [{ src, alt: "Blå lue på et bord" }],
        variants: [{ optionValues: [], priceOre: 39900, stock: null }],
      },
      user.id,
    );
    const meta = await shopMeta(db, site, { kind: "product", slug: "strikket-lue" });
    expect(meta.title).toBe("Strikket lue");
    expect(meta.image).toEqual({ src, alt: "Blå lue på et bord" });
    expect(meta.description!.length).toBeLessThanOrEqual(162);
    expect(meta.description).toMatch(/ …$/);
    expect(meta.description).not.toMatch(/\s{2}/);
    expect(await shopMeta(db, site, { kind: "product", slug: "finnes-ikke" })).toEqual({ title: "Vare" });
  });
});
