import { describe, expect, it } from "vitest";
import { looksLikeLeadSpam } from "@/lib/lead-spam";

describe("looksLikeLeadSpam", () => {
  it("stopper roboten som fyller feltene med nettadressen", () => {
    expect(looksLikeLeadSpam({ company: ":https://nettgata.no/:", bransje: ":https://nettgata.no/:", message: ":https://nettgata.no/:" })).toBe(true);
  });
  it("stopper nettadresse som bransje alene", () => {
    expect(looksLikeLeadSpam({ bransje: "https://example.com" })).toBe(true);
  });
  it("slipper gjennom ekte henvendelser, også med lenke i meldingen", () => {
    expect(looksLikeLeadSpam({ company: "Hansen Rør AS", bransje: "Rørlegger", message: "Har siden https://hansenror.no i dag, vil ha ny." })).toBe(false);
    expect(looksLikeLeadSpam({ company: "https://hansenror.no", bransje: "Rørlegger", message: "Hei!" })).toBe(false);
    expect(looksLikeLeadSpam({})).toBe(false);
  });
});
