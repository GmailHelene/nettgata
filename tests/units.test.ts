import { describe, expect, it } from "vitest";
import { demoTheme } from "@/db/demo";
import { isSafeHref } from "@/lib/content/fields";
import { isPlatformHost, slugFromHost } from "@/lib/hosts";
import { createPreviewToken, verifyPreviewToken } from "@/lib/preview";
import { contrastRatio, themeContrastProblems } from "@/lib/theme";

describe("lenker", () => {
  it("tillater vanlige lenker og stopper farlige", () => {
    for (const ok of ["/kontakt", "#kontakt", "https://vipps.no", "mailto:a@b.no", "tel:90000000"]) expect(isSafeHref(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "vbscript:x"]) expect(isSafeHref(bad)).toBe(false);
  });
});

describe("vertsnavn", () => {
  it("kjenner igjen plattformen og underdomener", () => {
    expect(isPlatformHost("localhost:3000")).toBe(true);
    expect(isPlatformHost("app.helene.cloud")).toBe(true);
    expect(isPlatformHost("demo.helene.cloud")).toBe(false);
    expect(slugFromHost("demo.helene.cloud")).toBe("demo");
    expect(slugFromHost("a.b.helene.cloud")).toBeNull();
    expect(slugFromHost("-demo.helene.cloud")).toBeNull();
  });
});

describe("universell utforming", () => {
  it("regner kontrast etter WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(themeContrastProblems(demoTheme)).toEqual([]);
    expect(themeContrastProblems({ ...demoTheme, text: "#bbbbbb" }).length).toBeGreaterThan(0);
  });
});

describe("forhåndsvisning", () => {
  it("godtar bare gyldige, signerte lenker", async () => {
    const token = await createPreviewToken("side-1");
    expect(await verifyPreviewToken(token)).toBe("side-1");
    expect(await verifyPreviewToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifyPreviewToken(await createPreviewToken("side-1", "-1s"))).toBeNull();
  });
});
