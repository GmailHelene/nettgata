import { describe, expect, it } from "vitest";
import { lagKjopsvilkar } from "@/lib/legal/angrerett";
import { sideSomTekst } from "@/lib/legal/felles";
import { generatedLegalPage, hasCheckoutTerms } from "@/lib/legal/kundesider";

const info = { mvaRegistrert: true, orgnr: "927889404", email: "post@krok.no", phone: "900 00 000", street: "Storgata 1", postalCode: "3370", city: "Vikersund", openingHours: [], specialHours: [] };
const butikk = { name: "Kari sin krok", kind: "nettbutikk" as const, info, shop: {} };

describe("kjøpsvilkår laget av Nettgata", () => {
  it("har selger, angrerett, reklamasjon og klage, uten tankestrek", () => {
    const side = lagKjopsvilkar({ butikk: { navn: butikk.name, info } });
    const tekst = JSON.stringify(sideSomTekst(side));
    expect(side.seo.title).toBe("Kjøpsvilkår | Kari sin krok");
    for (const ord of ["927 889 404", "Vikersund", "14 dagers angrerett", "reklamere", "Forbrukertilsynet"]) expect(tekst).toContain(ord);
    expect(tekst).not.toMatch(/[—–]/);
    expect(side.sections.filter((s) => s.props.overskrift === "Kjøpsvilkår")).toHaveLength(1);
  });

  it("vises på /kjopsvilkar bare for nettbutikker", () => {
    expect(generatedLegalPage(butikk, "/kjopsvilkar")).not.toBeNull();
    expect(generatedLegalPage({ ...butikk, kind: "nettside" }, "/kjopsvilkar")).toBeNull();
  });

  it("åpner kassen bare når opplysningene loven krever er fylt ut, eller en egen side er publisert", async () => {
    const ingen = async () => null;
    expect(await hasCheckoutTerms(butikk, "/kjopsvilkar", ingen)).toBe(true);
    expect(await hasCheckoutTerms({ ...butikk, info: { ...info, phone: "" } }, "/kjopsvilkar", ingen)).toBe(false);
    expect(await hasCheckoutTerms(butikk, "/vilkar", ingen)).toBe(false);
    expect(await hasCheckoutTerms({ ...butikk, info: {} }, "/vilkar", async () => ({}))).toBe(true);
  });
});
