import { describe, expect, it } from "vitest";
import { findRedirect, normalizeFrom, normalizeTo, parseRedirectList } from "@/lib/redirects";

describe("omdirigeringer", () => {
  it("gjør gamle adresser like uansett form", () => {
    expect(normalizeFrom("https://gammel.no/Om-Oss/")).toBe("/om-oss");
    expect(normalizeFrom("/tjenester/bad.html")).toBe("/tjenester/bad.html");
    expect(normalizeFrom("/?page_id=12")).toBe("/?page_id=12");
    expect(normalizeFrom("/?b=2&a=1")).toBe("/?a=1&b=2");
    expect(normalizeFrom("/r%C3%B8r")).toBe("/rør");
    expect(normalizeFrom("/studio/x")).toBeNull();
    expect(normalizeFrom("javascript:alert(1)")).toBeNull();
    expect(normalizeFrom("")).toBeNull();
  });

  it("godtar bare stier og https som ny adresse", () => {
    expect(normalizeTo("/kontakt")).toBe("/kontakt");
    expect(normalizeTo("https://example.no/side")).toBe("https://example.no/side");
    expect(normalizeTo("http://example.no/side")).toBeNull();
    expect(normalizeTo("//ond.no")).toBeNull();
    expect(normalizeTo("javascript:alert(1)")).toBeNull();
    expect(normalizeTo("/med mellomrom")).toBeNull();
    // Nettleseren gjør «\» om til «/» og fjerner tabulator, så disse ville gått til ond.no.
    for (const sneaky of ["/\\ond.no", "/\\/ond.no", "/\t/ond.no", "/%09/ok", "/\n/ond.no"]) {
      expect(normalizeTo(sneaky), JSON.stringify(sneaky)).toBe(sneaky === "/%09/ok" ? sneaky : null);
    }
  });

  it("bruker ikke en lagret omdirigering som går til et annet nettsted", () => {
    // Kan finnes fra før regelen ble strengere.
    expect(findRedirect([{ from: "/gammel", to: "/\\ond.no" }], "/gammel")).toBeNull();
    expect(findRedirect([{ from: "/gammel", to: "/ny" }], "/gammel")).toBe("/ny");
  });

  it("leser en liste og forklarer feil per linje", () => {
    const { redirects, errors } = parseRedirectList(
      ["# fra gammel WordPress", "/?page_id=12 /om-oss", "https://gammel.no/tjenester/ /priser", "/kontakt-oss,/kontakt", "/feil", "/a ftp://x"].join("\n"),
    );
    expect(redirects).toEqual([
      { from: "/?page_id=12", to: "/om-oss" },
      { from: "/tjenester", to: "/priser" },
      { from: "/kontakt-oss", to: "/kontakt" },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Linje 5/);
  });

  it("finner riktig mål, med og uten spørring", () => {
    const list = [
      { from: "/?page_id=12", to: "/om-oss" },
      { from: "/blogg/gammel-post", to: "/blogg/ny-post" },
    ];
    expect(findRedirect(list, "/", "?page_id=12")).toBe("/om-oss");
    expect(findRedirect(list, "/Blogg/Gammel-Post/", "?utm_source=x")).toBe("/blogg/ny-post");
    expect(findRedirect(list, "/finnes-ikke")).toBeNull();
    expect(findRedirect(undefined, "/x")).toBeNull();
  });
});
