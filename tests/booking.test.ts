import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionPreview, type RenderContext } from "@/components/sections";
import { embeddableHost } from "@/lib/booking";
import { exampleSection, hasExampleText } from "@/lib/content/examples";
import { validatePageContent } from "@/lib/content/registry";
import type { Section } from "@/lib/content/types";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { buildTheme } from "@/lib/themes";

const ctx: RenderContext = {
  site: { id: "s", name: "Salongen", info: readSiteInfo({}), schemaType: "HairSalon" },
  nav: [],
  path: "/",
  preview: false,
  basePath: "",
  shop: false,
  products: [],
  layout: readSiteLayout({}),
};

const section = (variant: string, lenke: string): Section => ({
  id: "bestill",
  type: "bestill",
  variant,
  props: { overskrift: "Bestill time", knappTekst: "Bestill time", lenke },
});

const render = (s: Section) => renderToStaticMarkup(createElement(SectionPreview, { section: s, theme: buildTheme("atelier")!, ctx }));

describe("timebestilling", () => {
  it("kjenner igjen systemene som kan bygges inn, også på underdomener", () => {
    expect(embeddableHost("https://www.fresha.com/a/salongen-oslo")).toBe("fresha.com");
    expect(embeddableHost("https://app.resos.com/salongen")).toBe("resos.com");
    expect(embeddableHost("https://timma.no/salong/salongen")).toBe("timma.no");
    for (const bad of ["http://timma.no/x", "https://timma.no.ond.no/x", "https://ondtimma.no/x", "https://user:pass@fresha.com/", "javascript:alert(1)", "/kontakt", ""]) {
      expect(embeddableHost(bad), bad).toBeNull();
    }
  });

  it("viser knapp til bestillingen, og bygger bare inn kjente systemer etter at den besøkende har trykket", () => {
    const button = render(section("knapp", "https://www.fresha.com/a/salongen"));
    expect(button).toContain('href="https://www.fresha.com/a/salongen"');
    expect(button).not.toContain("<iframe");

    // Innebygd: ingenting lastes fra Fresha før trykket. Bare en knapp, en forklaring og en lenke.
    const embed = render(section("innebygd", "https://www.fresha.com/a/salongen"));
    expect(embed).not.toContain("<iframe");
    expect(embed).toContain("Bestillingen hentes fra fresha.com");
    expect(embed).toContain('<button type="button" class="ng-btn">Bestill time</button>');

    // Ukjent system i varianten «Innebygd» blir en vanlig knapp.
    const unknown = render(section("innebygd", "https://booking.ukjent.no/salongen"));
    expect(unknown).toContain('href="https://booking.ukjent.no/salongen"');
    expect(unknown).not.toContain("hentes fra");
  });

  it("krever lenke for å publiseres, og eksempelteksten må byttes ut", () => {
    const example = exampleSection("bestill", "knapp");
    expect(hasExampleText(example)).toBe(true);
    expect(validatePageContent({ seo: {}, sections: [example] }, "draft").ok).toBe(true);
    expect(validatePageContent({ seo: {}, sections: [example] }).ok).toBe(false);
    expect(validatePageContent({ seo: {}, sections: [section("knapp", "https://timma.no/salong/x")] }).ok).toBe(true);
  });
});
