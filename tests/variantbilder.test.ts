import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/shop/catalog";

const src = "/media/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.webp";
const base = {
  name: "Genser",
  status: "active",
  vatRate: 25,
  images: [{ src, alt: "Blå genser" }],
  options: [{ name: "Farge", values: ["Blå", "Rød"], media: { "Blå": { image: src, color: "#1d4ed8" } } }],
  variants: [
    { optionValues: ["Blå"], priceOre: 49900, stock: 5 },
    { optionValues: ["Rød"], priceOre: 49900, stock: 5 },
  ],
};
const messages = (input: unknown) => {
  const parsed = productInputSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
};

describe("bilde og farge per valg", () => {
  it("godtar bilde og farge og beholder dem", () => {
    const parsed = productInputSchema.parse(base);
    expect(parsed.options[0].media?.["Blå"]).toEqual({ image: src, color: "#1d4ed8" });
  });

  it("varer uten bilde og farge virker som før", () => {
    expect(messages({ ...base, options: [{ name: "Farge", values: ["Blå", "Rød"] }] })).toEqual([]);
  });

  it("bildet må være et av varens egne bilder", () => {
    const other = "/media/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000002.webp";
    const result = messages({ ...base, options: [{ name: "Farge", values: ["Blå", "Rød"], media: { "Blå": { image: other } } }] });
    expect(result.join(" ")).toContain("ikke et av varens bilder");
  });

  it("fargen må være en fargekode, så den ikke kan brukes til å sette inn annen CSS", () => {
    const result = messages({ ...base, options: [{ name: "Farge", values: ["Blå", "Rød"], media: { "Blå": { color: "red;background:url(x)" } } }] });
    expect(result.join(" ")).toContain("gyldig fargekode");
  });

  it("verdien må finnes i valget", () => {
    const result = messages({ ...base, options: [{ name: "Farge", values: ["Blå", "Rød"], media: { Grønn: { color: "#00ff00" } } }] });
    expect(result.join(" ")).toContain("er ikke en verdi");
  });
});
