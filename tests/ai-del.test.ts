import { describe, expect, it } from "vitest";
import { facebookShareUrl, sharePageUrl } from "@/lib/ai/share";

describe("«Del på Facebook» ved innleggsforslag", () => {
  it("lager Facebooks delingslenke med adressen til nettstedet", () => {
    expect(facebookShareUrl("https://ullstua.no/")).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fullstua.no%2F");
    // Adresser med æ, ø, å og spørring kodes, så de ikke blander seg med Facebooks egne parametre.
    expect(facebookShareUrl("https://ullstua.no/strikkeøl?farge=blå&str=m")).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fullstua.no%2Fstrikke%25C3%25B8l%3Ffarge%3Dbl%25C3%25A5%26str%3Dm",
    );
    // Ankeret tas bort, det betyr ingenting for Facebook.
    expect(facebookShareUrl("https://ullstua.no/om-oss#kontakt")).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fullstua.no%2Fom-oss");
  });

  it("godtar bare vanlige nettadresser", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hei", "ikke en adresse", "", "https://bruker:passord@ullstua.no/"]) {
      expect(facebookShareUrl(bad)).toBeNull();
    }
  });

  it("deler siden innlegget gjelder, ellers forsiden", () => {
    expect(sharePageUrl("https://ullstua.no", null)).toBe("https://ullstua.no/");
    expect(sharePageUrl("https://ullstua.no/", "/")).toBe("https://ullstua.no/");
    expect(sharePageUrl("https://ullstua.no", "/garn")).toBe("https://ullstua.no/garn");
    expect(sharePageUrl("http://ullstua.helene.cloud", "vinter/lue")).toBe("http://ullstua.helene.cloud/vinter/lue");
  });
});
