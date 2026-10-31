import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, users } from "@/db/schema";
import { qrMatrix, qrSvg, reedSolomonForTests } from "@/lib/qr";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp,
} from "@/lib/totp";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  renewRecoveryCodes,
  resetTotpForUser,
  twoFactorStatus,
  TwoFactorError,
  verifySecondFactor,
} from "@/lib/two-factor";

const hex = (s: string) => s.split(" ").map((b) => parseInt(b, 16));

describe("QR-koder", () => {
  it("feilrettingen stemmer med eksempelet fra QR-standarden (HELLO WORLD, 1-M)", () => {
    const { rsDivisor, rsRemainder } = reedSolomonForTests;
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("feilrettingen stemmer med segno for de samme dataene", () => {
    const { rsDivisor, rsRemainder } = reedSolomonForTests;
    const data = hex("40 34 86 56 90 00 ec 11 ec 11 ec 11 ec 11 ec 11");
    expect(rsRemainder(data, rsDivisor(10))).toEqual(hex("15 03 36 48 62 93 8c d6 c7 cd"));
  });

  it("velger minste versjon og har finnermønstre i tre hjørner", () => {
    expect(qrMatrix("Hei")).toHaveLength(21);
    const uri = "otpauth://totp/Nettgata:admin%40plattformen.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Nettgata";
    const m = qrMatrix(uri);
    const n = m.length;
    for (const [x0, y0] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      // Ytre ring av finnermønsteret er mørk, ringen innenfor lys, kjernen mørk.
      expect(m[y0][x0]).toBe(true);
      expect(m[y0 + 1][x0 + 1]).toBe(false);
      expect(m[y0 + 3][x0 + 3]).toBe(true);
    }
    expect(() => qrMatrix("x".repeat(3000))).toThrow(/for lang/);
  });

  it("lager SVG uten at etiketten kan bryte ut av attributtet", () => {
    const svg = qrSvg("Hei", 'QR "<script>');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('aria-label="QR script"');
    expect(svg).not.toContain("<script>");
  });
});

describe("engangskoder (TOTP)", () => {
  const rfcSecret = new TextEncoder().encode("12345678901234567890");

  it("gir de offisielle testverdiene fra RFC 6238 (SHA-1)", async () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, expected] of vectors) expect(await totpCode(rfcSecret, totpStep(seconds * 1000), 8)).toBe(expected);
    // Seks siffer er de seks siste.
    expect(await totpCode(rfcSecret, totpStep(59_000))).toBe("287082");
  });

  it("base32 følger RFC 4648 og tåler mellomrom og små bokstaver", () => {
    const vectors: [string, string][] = [
      ["f", "MY"],
      ["fo", "MZXQ"],
      ["foo", "MZXW6"],
      ["foob", "MZXW6YQ"],
      ["fooba", "MZXW6YTB"],
      ["foobar", "MZXW6YTBOI"],
    ];
    for (const [plain, encoded] of vectors) {
      expect(base32Encode(new TextEncoder().encode(plain))).toBe(encoded);
      expect(new TextDecoder().decode(base32Decode(` ${encoded.toLowerCase()} `))).toBe(plain);
    }
    expect(() => base32Decode("1")).toThrow();
  });

  it("godtar ett steg klokkeforskjell, men ikke mer, og aldri samme kode to ganger", async () => {
    const now = Date.UTC(2026, 9, 31, 12, 0, 10);
    const step = totpStep(now);
    const code = (s: number) => totpCode(rfcSecret, s);
    expect(await verifyTotp(rfcSecret, await code(step), now, null)).toBe(step);
    expect(await verifyTotp(rfcSecret, await code(step - 1), now, null)).toBe(step - 1);
    expect(await verifyTotp(rfcSecret, await code(step + 1), now, null)).toBe(step + 1);
    expect(await verifyTotp(rfcSecret, await code(step - 2), now, null)).toBeNull();
    expect(await verifyTotp(rfcSecret, await code(step), now, step)).toBeNull();
    const current = await code(step);
    expect(await verifyTotp(rfcSecret, `${current.slice(0, 3)} ${current.slice(3)}`, now, null)).toBe(step);
    expect(await verifyTotp(rfcSecret, "12345", now, null)).toBeNull();
  });

  it("krypterer hemmeligheten med ny IV hver gang, og oppdager endringer", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const a = await encryptSecret(secret);
    const b = await encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a)).toEqual(secret);
    const [v, iv, ct] = a.split(":");
    const tampered = `${v}:${iv}:${ct.slice(0, -4)}${ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
    await expect(decryptSecret(tampered)).rejects.toThrow();
    expect(otpauthUri("ABC", "kari@ullstua.no")).toBe(
      "otpauth://totp/Nettgata%3Akari%40ullstua.no?secret=ABC&issuer=Nettgata&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("reservekodene er unike, lette å lese, og like uansett skrivemåte", async () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
    expect(await hashRecoveryCode(codes[0].toUpperCase().replace("-", " "))).toBe(await hashRecoveryCode(codes[0]));
  });
});

describe("tofaktor for en bruker", () => {
  const start = Date.UTC(2026, 9, 31, 12, 0, 10);
  const later = (steps: number) => start + steps * 30_000;

  async function setup() {
    const db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "kari@ullstua.no", passwordHash: "x" }).returning();
    const { secret, uri } = await beginTotpSetup(db, user.id);
    expect(uri).toContain(`secret=${secret}`);
    const key = base32Decode(secret);
    const codeAt = (now: number) => totpCode(key, totpStep(now));
    return { db, userId: user.id, codeAt };
  }

  it("slås på med kode fra appen, og gir ti reservekoder én gang", async () => {
    const { db, userId, codeAt } = await setup();
    expect((await twoFactorStatus(db, userId)).enabled).toBe(false);
    await expect(confirmTotpSetup(db, userId, "000000", start)).rejects.toBeInstanceOf(TwoFactorError);
    const codes = await confirmTotpSetup(db, userId, await codeAt(start), start);
    expect(codes).toHaveLength(10);
    expect(await twoFactorStatus(db, userId)).toEqual({ enabled: true, recoveryLeft: 10 });
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    // Hemmeligheten ligger kryptert, og reservekodene bare som HMAC.
    expect(row.totpSecret).toMatch(/^v1:/);
    expect(row.totpRecovery.some((h) => codes.includes(h))).toBe(false);
    await expect(beginTotpSetup(db, userId)).rejects.toThrow(/allerede/);
  });

  it("innlogging: koden fra appen virker én gang, og koden fra oppsettet kan ikke brukes igjen", async () => {
    const { db, userId, codeAt } = await setup();
    await confirmTotpSetup(db, userId, await codeAt(start), start);
    expect(await verifySecondFactor(db, userId, await codeAt(start), start)).toBeNull();
    const next = await codeAt(later(1));
    expect(await verifySecondFactor(db, userId, next, later(1))).toBe("app");
    expect(await verifySecondFactor(db, userId, next, later(1))).toBeNull();
    expect(await verifySecondFactor(db, userId, "123456", later(2))).toBeNull();
  });

  it("en reservekode virker én gang og telles ned", async () => {
    const { db, userId, codeAt } = await setup();
    const codes = await confirmTotpSetup(db, userId, await codeAt(start), start);
    expect(await verifySecondFactor(db, userId, codes[3].toUpperCase(), later(1))).toBe("reservekode");
    expect(await verifySecondFactor(db, userId, codes[3], later(1))).toBeNull();
    expect((await twoFactorStatus(db, userId)).recoveryLeft).toBe(9);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "user.2fa_recovery_used"))).toHaveLength(1);
  });

  it("slås av eller får nye reservekoder bare med gyldig kode", async () => {
    const { db, userId, codeAt } = await setup();
    const first = await confirmTotpSetup(db, userId, await codeAt(start), start);
    const renewed = await renewRecoveryCodes(db, userId, await codeAt(later(1)), later(1));
    expect(await verifySecondFactor(db, userId, first[0], later(2))).toBeNull();
    expect(await verifySecondFactor(db, userId, renewed[0], later(2))).toBe("reservekode");
    await expect(disableTotp(db, userId, "000000", later(3))).rejects.toThrow(/stemmer ikke/);
    await disableTotp(db, userId, await codeAt(later(3)), later(3));
    expect(await twoFactorStatus(db, userId)).toEqual({ enabled: false, recoveryLeft: 0 });
    expect(await verifySecondFactor(db, userId, await codeAt(later(4)), later(4))).toBeNull();
  });

  it("plattformadmin kan nullstille for en kunde som har mistet alt", async () => {
    const { db, userId, codeAt } = await setup();
    await confirmTotpSetup(db, userId, await codeAt(start), start);
    const [admin] = await db.insert(users).values({ email: "helene@nettgata.no", passwordHash: "x", isPlatformAdmin: true }).returning();
    await resetTotpForUser(db, admin.id, " KARI@ullstua.no ");
    expect((await twoFactorStatus(db, userId)).enabled).toBe(false);
    await expect(resetTotpForUser(db, admin.id, "finnes@ikke.no")).rejects.toThrow(/Fant ingen/);
  });
});
