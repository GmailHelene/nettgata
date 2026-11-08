import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("hoder på alle sider", () => {
  it("andre nettsteder kan ikke ramme inn sidene", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    expect(all).toContainEqual({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    expect(all).toContainEqual({ key: "Content-Security-Policy", value: "frame-ancestors 'self'" });
    expect(all.find((h) => h.key === "Permissions-Policy")?.value).toContain("camera=()");
  });

  it("filene med innhold i navnet lagres lenge i nettleseren", () => {
    const file = readFileSync("public/_headers", "utf8");
    expect(file).toMatch(/\/_next\/static\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });
});
