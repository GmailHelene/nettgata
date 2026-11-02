import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as appleIcon } from "@/app/apple-touch-icon.png/route";
import { GET as favicon } from "@/app/favicon.ico/route";

const platform = (path: string) => new Request(`https://app.helene.cloud${path}`, { headers: { host: "app.helene.cloud" } });

describe("Nettgata sitt eget ikon", () => {
  it("sender /favicon.ico og /apple-touch-icon.png på plattformens adresse til gateskiltet", async () => {
    const ico = await favicon(platform("/favicon.ico"));
    expect(ico.status).toBe(308);
    expect(ico.headers.get("location")).toBe("https://app.helene.cloud/nettgata/favicon.ico");
    const apple = await appleIcon(platform("/apple-touch-icon.png"));
    expect(apple.status).toBe(308);
    expect(apple.headers.get("location")).toBe("https://app.helene.cloud/nettgata/ikon-180.png");
  });

  it("peker på filer som finnes", () => {
    for (const file of ["ikon.svg", "favicon.ico", "ikon-180.png"]) expect(existsSync(`public/nettgata/${file}`)).toBe(true);
    // Selve layouten laster fontene og kan ikke importeres her, så vi sjekker at den peker på filene.
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("/nettgata/ikon.svg");
  });
});
