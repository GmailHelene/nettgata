import { SignJWT } from "jose";
import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Skjemaet leser IP-adressen fra forespørselen. Her bestemmer testen den.
const ip = vi.hoisted(() => ({ value: "203.0.113.7" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip.value }) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSiteAccess: vi.fn(), checkSiteAccess: vi.fn(), requireUser: vi.fn() }));

import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { inquiries, inquiryImages, pages, pageVersions, sites, users } from "@/db/schema";
import { startInquiryImageUpload, submitInquiry } from "@/app/actions/inquiry";
import { deleteInquiryAction } from "@/app/studio/site-actions";
import { DELETE as removeRoute, POST as uploadRoute } from "@/app/api/henvendelse/bilde/route";
import { GET as viewRoute } from "@/app/studio/api/henvendelse-bilde/[imageId]/route";
import { formFieldProblems, parseFormAnswers, readFormFields } from "@/lib/content/form-fields";
import { exportStream, runExportStep, startExport } from "@/lib/eksport";
import { readZip } from "@/lib/eksport/zip";
import { newInquiryEmail } from "@/lib/email/templates";
import {
  cleanupInquiryImages,
  createUploadToken,
  deleteInquiryImages,
  MAX_INQUIRY_IMAGE_BYTES,
  ORPHAN_HOURS,
  pendingImages,
  readUploadToken,
  saveInquiryImage,
  sniffInquiryImage,
  UPLOAD_TOKEN_MINUTES,
  usesInquiryImages,
} from "@/lib/henvendelser/bilder";
import { lagPersonvernerklaering } from "@/lib/legal/personvern";
import { runRetention } from "@/lib/retention";
import { checkSiteAccess, requireSiteAccess } from "@/lib/session";
import { deleteSite } from "@/lib/selvbetjening/opprydding";
import { createSiteFromPack } from "@/lib/sites";
import { setMediaStoreForTests, type MediaStore, type StoredObject } from "@/lib/storage";

function memoryStore(): MediaStore & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    async put(key, data, contentType) {
      objects.set(key, { body: data.slice(), contentType, size: data.byteLength });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = new TextEncoder().encode("GIF89a....");
const HTML = new TextEncoder().encode("<!DOCTYPE html><img src=x onerror=alert(1)>");

let db: Db;
let store: ReturnType<typeof memoryStore>;
let site: typeof sites.$inferSelect;
let ownerId: string;
const target = { path: "/kontakt", sectionId: "kontakt" };

async function publishAll(siteId: string) {
  for (const page of await db.select().from(pages).where(eq(pages.siteId, siteId))) {
    const [version] = await db.insert(pageVersions).values({ pageId: page.id, number: 1, title: page.title, content: page.draft, publishedBy: ownerId }).returning();
    await db.update(pages).set({ publishedVersionId: version.id }).where(eq(pages.id, page.id));
  }
}

const tokenFor = (siteId = site.id, now = new Date()) => createUploadToken(db, { siteId, ...target }, now);
const upload = (token: string, bytes: Uint8Array = JPEG, ipKey = "ip-a", now = new Date()) => saveInquiryImage(db, store, { token, bytes, ipKey }, now);

/** Kontaktskjemaet slik nettleseren sender det. Bildefeltet er felt-2 i håndverkerpakkene (adresse, dato, bilder). */
function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  const fields = { name: "Kari Nordmann", email: "kari@example.no", message: "Lekker under vasken, se bildene.", path: "/kontakt", section: "kontakt", ...extra };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  store = memoryStore();
  setMediaStoreForTests(store);
  ip.value = "203.0.113.7";
  const [owner] = await db.insert(users).values({ email: "eier@ror.no", passwordHash: "x" }).returning();
  ownerId = owner.id;
  const created = await createSiteFromPack(db, { name: "Rør Test", packKey: "rorlegger", themeKey: "verksted", info: demoInfo, ownerId });
  await publishAll(created.id);
  [site] = await db.select().from(sites).where(eq(sites.id, created.id));
  vi.mocked(checkSiteAccess).mockResolvedValue(null);
});

describe("Bildefeltet", () => {
  it("er med i håndverkerpakkene, bare ett per skjema, og gir ingen svar i listen", async () => {
    const [kontakt] = await db.select().from(pages).where(eq(pages.siteId, site.id));
    const fields = readFormFields({
      skjemafelt: [
        { etikett: "Bilder", felttype: "bilder", pakrevd: "nei" },
        { etikett: "Flere bilder", felttype: "bilder", pakrevd: "nei" },
      ],
    });
    expect(fields.map((f) => f.label)).toEqual(["Bilder"]);
    expect(formFieldProblems({ skjemafelt: [{ felttype: "bilder" }, { felttype: "bilder" }] })).toEqual(["Felt 2: skjemaet kan bare ha ett felt for bilder"]);
    expect(parseFormAnswers(fields, { "felt-0": "noe" })).toEqual({ ok: true, answers: [] });
    expect(kontakt).toBeTruthy();

    const published = (await db.select({ content: pageVersions.content }).from(pageVersions)).map((r) => r.content);
    expect(usesInquiryImages(published)).toBe(true);
    const contact = published.flatMap((c) => c.sections).find((s) => s.type === "kontakt")!;
    expect(readFormFields(contact.props).find((f) => f.type === "bilder")?.label).toBe("Bilder av jobben");
  });
});

describe("Opplastingsnøkkelen", () => {
  it("gis bare for et publisert skjema med bildefelt", async () => {
    await expect(createUploadToken(db, { siteId: site.id, path: "/kontakt", sectionId: "finnes-ikke" })).rejects.toThrow("tar ikke imot bilder");
    await expect(createUploadToken(db, { siteId: site.id, path: "/", sectionId: "kontakt" })).rejects.toThrow("tar ikke imot bilder");
    await expect(createUploadToken(db, { siteId: crypto.randomUUID(), ...target })).rejects.toThrow();

    // Et frisørnettsted har ikke bildefeltet.
    const frisor = await createSiteFromPack(db, { name: "Salong", packKey: "frisor", themeKey: "atelier", info: demoInfo, ownerId });
    await publishAll(frisor.id);
    await expect(tokenFor(frisor.id)).rejects.toThrow("tar ikke imot bilder");

    const token = await tokenFor();
    expect(await readUploadToken(token, UPLOAD_TOKEN_MINUTES)).toMatchObject({ siteId: site.id, path: "/kontakt", sectionId: "kontakt" });
  });

  it("utløper, kan ikke endres og kan ikke lages med en annen nøkkel eller et annet formål", async () => {
    const now = new Date("2026-11-02T10:00:00Z");
    const token = await tokenFor(site.id, now);
    expect(await readUploadToken(token, UPLOAD_TOKEN_MINUTES, new Date(now.getTime() + 119 * 60_000))).not.toBeNull();
    expect(await readUploadToken(token, UPLOAD_TOKEN_MINUTES, new Date(now.getTime() + 121 * 60_000))).toBeNull();
    // Til å knytte bildene til skjemaet gjelder den et døgn.
    expect(await readUploadToken(token, ORPHAN_HOURS * 60, new Date(now.getTime() + 23 * 3_600_000))).not.toBeNull();
    expect(await readUploadToken(token, ORPHAN_HOURS * 60, new Date(now.getTime() + 25 * 3_600_000))).toBeNull();
    await expect(upload(token, JPEG, "ip-a", new Date(now.getTime() + 3 * 3_600_000))).rejects.toThrow("utløpt");

    const [head, body, sig] = token.split(".");
    const flipped = `${head}.${body}.${sig.slice(0, -2)}${sig.endsWith("AA") ? "BB" : "AA"}`;
    expect(await readUploadToken(flipped, UPLOAD_TOKEN_MINUTES, now)).toBeNull();

    const payload = { s: site.id, p: "/kontakt", f: "kontakt", sub: crypto.randomUUID() };
    const wrongKey = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience("henvendelse-bilder").setIssuedAt().sign(new TextEncoder().encode("en-helt-annen-hemmelighet-som-er-lang-nok"));
    expect(await readUploadToken(wrongKey, UPLOAD_TOKEN_MINUTES)).toBeNull();
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const otherAudience = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience("konto-bekreft").setIssuedAt().sign(secret);
    expect(await readUploadToken(otherAudience, UPLOAD_TOKEN_MINUTES)).toBeNull();
  });

  it("er bundet til nettsted, side og skjema når skjemaet sendes", async () => {
    const token = await tokenFor();
    const { id } = await upload(token);
    expect(await pendingImages(db, { siteId: site.id, ...target, token, ids: [id] })).toMatchObject({ ids: [id] });
    expect(await pendingImages(db, { siteId: crypto.randomUUID(), ...target, token, ids: [id] })).toBeNull();
    expect(await pendingImages(db, { siteId: site.id, path: "/", sectionId: "kontakt", token, ids: [id] })).toBeNull();
    // En annen nøkkel (en annen besøkende) kan ikke ta bildene.
    expect(await pendingImages(db, { siteId: site.id, ...target, token: await tokenFor(), ids: [id] })).toBeNull();
  });

  it("stopper når siden ikke lenger har bildefeltet", async () => {
    const token = await tokenFor();
    const [page] = await db.select().from(pages).where(eq(pages.siteId, site.id));
    const versions = await db.select().from(pageVersions);
    for (const v of versions) {
      const content = { ...v.content, sections: v.content.sections.map((s) => (s.type === "kontakt" ? { ...s, props: { ...s.props, skjemafelt: [] } } : s)) };
      await db.update(pageVersions).set({ content }).where(eq(pageVersions.id, v.id));
    }
    expect(page).toBeTruthy();
    await expect(upload(token)).rejects.toThrow("tar ikke imot bilder");
  });
});

describe("Typen sjekkes fra innholdet", () => {
  it("tar imot JPEG, PNG og WebP, og avviser SVG, GIF, HTML og tomme filer", async () => {
    expect(sniffInquiryImage(JPEG)).toBe("image/jpeg");
    expect(sniffInquiryImage(PNG)).toBe("image/png");
    expect(sniffInquiryImage(WEBP)).toBe("image/webp");
    expect(sniffInquiryImage(SVG)).toBeNull();
    expect(sniffInquiryImage(GIF)).toBeNull();
    expect(sniffInquiryImage(HTML)).toBeNull();

    const token = await tokenFor();
    await expect(upload(token, SVG)).rejects.toThrow("ikke et bilde");
    await expect(upload(token, HTML)).rejects.toThrow("ikke et bilde");
    await expect(upload(token, new Uint8Array())).rejects.toThrow("tomt");
    const { id } = await upload(token, PNG);
    const [row] = await db.select().from(inquiryImages).where(eq(inquiryImages.id, id));
    expect(row.contentType).toBe("image/png");
    expect(row.key).toBe(`henvendelser/${site.id}/${id}.png`);
    expect(store.objects.get(row.key)?.contentType).toBe("image/png");
  });
});

describe("Grenser", () => {
  it("høyst fem bilder per nøkkel, og ingen over 5 MB", async () => {
    const token = await tokenFor();
    for (let i = 0; i < 5; i++) await upload(token);
    await expect(upload(token)).rejects.toThrow("høyst 5 bilder");
    const big = new Uint8Array(MAX_INQUIRY_IMAGE_BYTES + 1);
    big.set(JPEG);
    await expect(upload(await tokenFor(), big)).rejects.toThrow("for stort");
  });

  it("per IP-adresse og per nettsted", async () => {
    for (let i = 0; i < 6; i++) {
      const token = await tokenFor();
      for (let j = 0; j < 5; j++) await upload(token, JPEG, "ip-travel");
    }
    await expect(upload(await tokenFor(), JPEG, "ip-travel")).rejects.toThrow("mange bilder");
    // En annen adresse kan fortsatt laste opp.
    await expect(upload(await tokenFor(), JPEG, "ip-ny")).resolves.toHaveProperty("id");
  });

  it("opplastingsruten avviser andre nettsteder, store forespørsler og SVG", async () => {
    const token = await tokenFor();
    const post = (body: FormData, headers: Record<string, string> = {}) => uploadRoute(new Request("http://localhost/api/henvendelse/bilde", { method: "POST", body, headers }));
    const fd = (bytes: Uint8Array) => {
      const f = new FormData();
      f.set("token", token);
      f.set("file", new Blob([bytes as BlobPart]), "bilde.jpg");
      return f;
    };
    expect((await post(fd(JPEG), { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post(fd(SVG))).status).toBe(415);
    expect((await post(fd(JPEG), { "content-length": String(MAX_INQUIRY_IMAGE_BYTES * 2) })).status).toBe(413);
    const ok = await post(fd(JPEG));
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: string };

    // Fjernes med samme nøkkel før skjemaet er sendt.
    const del = (t: string) =>
      removeRoute(new Request("http://localhost/api/henvendelse/bilde", { method: "DELETE", body: JSON.stringify({ token: t, id }), headers: { "content-type": "application/json" } }));
    await del(await tokenFor());
    expect(await db.select().from(inquiryImages)).toHaveLength(1);
    await del(token);
    expect(await db.select().from(inquiryImages)).toHaveLength(0);
    expect([...store.objects.keys()].filter((k) => k.startsWith("henvendelser/"))).toEqual([]);
  });
});

describe("Når skjemaet sendes", () => {
  it("knytter bildene til henvendelsen og sier fra i varselet", async () => {
    const token = await startInquiryImageUpload(site.id, "/kontakt", "kontakt");
    expect(token.ok).toBe(true);
    if (!token.ok) return;
    const a = await upload(token.token);
    const b = await upload(token.token);
    const res = await submitInquiry(site.id, null, form({ "bilde-nokkel": token.token, bilder: `${a.id},${b.id}`, "bilder-venter": "0" }));
    expect(res).toMatchObject({ ok: true });
    const [inquiry] = await db.select().from(inquiries);
    const rows = await db.select().from(inquiryImages);
    expect(rows.every((r) => r.inquiryId === inquiry.id)).toBe(true);

    // Kan ikke knyttes til en ny henvendelse etterpå.
    expect(await pendingImages(db, { siteId: site.id, ...target, token: token.token, ids: [a.id] })).toBeNull();

    const email = newInquiryEmail({
      shop: { name: "Rør Test", email: "", phone: "", street: "", postalCode: "", city: "", orgnr: "" },
      inquiry: { name: "Kari", email: null, phone: "99999999", message: "Hei", pagePath: "/kontakt" },
      siteUrl: "https://ror.no",
      studioUrl: "https://nettgata.no/studio/nettsted/x/henvendelser",
      imageCount: 2,
    });
    expect(email.text).toContain("2 bilder vedlagt, se dem i innboksen.");
    expect(email.html).toContain("2 bilder vedlagt, se dem i innboksen.");
    expect(email.html).not.toContain("henvendelse-bilde");
    expect(email.html).not.toContain("henvendelser/");
  });

  it("sier fra når bildene ikke kan sendes, i stedet for å sende uten dem", async () => {
    const token = await tokenFor();
    const { id } = await upload(token);
    const stranger = await tokenFor();
    const bad = await submitInquiry(site.id, null, form({ "bilde-nokkel": stranger, bilder: id }));
    expect(bad).toMatchObject({ ok: false, field: "felt-2" });
    expect(await db.select().from(inquiries)).toHaveLength(0);

    const waiting = await submitInquiry(site.id, null, form({ "bilde-nokkel": token, bilder: id, "bilder-venter": "1" }));
    expect(waiting).toMatchObject({ ok: false, message: "Vent litt, bildene lastes fortsatt opp" });
  });

  it("krever bilde når feltet er påkrevd, og honningkrukken gjelder fortsatt", async () => {
    for (const v of await db.select().from(pageVersions)) {
      const content = {
        ...v.content,
        sections: v.content.sections.map((s) => (s.type === "kontakt" ? { ...s, props: { ...s.props, skjemafelt: [{ etikett: "Bilder av skaden", felttype: "bilder", pakrevd: "ja" }] } } : s)),
      };
      await db.update(pageVersions).set({ content }).where(eq(pageVersions.id, v.id));
    }
    expect(await submitInquiry(site.id, null, form())).toMatchObject({ ok: false, message: "Legg ved minst ett bilde i «Bilder av skaden»", field: "felt-0" });

    const token = await tokenFor();
    const { id } = await upload(token);
    expect(await submitInquiry(site.id, null, form({ nettsted: "robot", "bilde-nokkel": token, bilder: id }))).toMatchObject({ ok: true });
    expect(await db.select().from(inquiries)).toHaveLength(0);
    expect((await db.select().from(inquiryImages))[0].inquiryId).toBeNull();
  });
});

async function inquiryWithImages(count = 2, createdAt = new Date()) {
  const token = await tokenFor(site.id, createdAt);
  const ids = [];
  for (let i = 0; i < count; i++) ids.push((await upload(token, JPEG, `ip-${crypto.randomUUID()}`, createdAt)).id);
  const [inquiry] = await db.insert(inquiries).values({ siteId: site.id, name: "Ola", message: "Hei", createdAt }).returning();
  await db.update(inquiryImages).set({ inquiryId: inquiry.id }).where(inArray(inquiryImages.id, ids));
  return { inquiry, ids };
}

describe("Visning i studioet", () => {
  const view = (id: string) => viewRoute(new Request(`http://localhost/studio/api/henvendelse-bilde/${id}`), { params: Promise.resolve({ imageId: id }) });
  const access = (role: "owner" | "editor" | "developer", s = site) => ({ user: { id: ownerId }, site: s, role }) as never;

  it("bare eier og redaktør av nettstedet, aldri cache, og ellers 404", async () => {
    const { ids } = await inquiryWithImages(1);
    expect((await view(ids[0])).status).toBe(404);

    vi.mocked(checkSiteAccess).mockResolvedValue(access("developer"));
    expect((await view(ids[0])).status).toBe(404);

    vi.mocked(checkSiteAccess).mockResolvedValue(access("editor"));
    const res = await view(ids[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    // Tilgangen sjekkes mot nettstedet bildet hører til, ikke et nettsted fra forespørselen.
    expect(vi.mocked(checkSiteAccess)).toHaveBeenLastCalledWith(site.id);

    expect((await view("ikke-en-id")).status).toBe(404);
  });

  it("viser ikke bilder som ikke er sendt med et skjema, og aldri via den offentlige bilderuten", async () => {
    vi.mocked(checkSiteAccess).mockResolvedValue(access("owner"));
    const { id } = await upload(await tokenFor());
    expect((await view(id)).status).toBe(404);
    const { GET: publicMedia } = await import("@/app/media/[...key]/route");
    const [row] = await db.select().from(inquiryImages);
    const res = await publicMedia(new Request("http://localhost/media/x"), { params: Promise.resolve({ key: row.key.split("/") }) });
    expect(res.status).toBe(404);
  });
});

describe("Sletting", () => {
  it("bildene slettes når henvendelsen slettes i innboksen", async () => {
    const { inquiry } = await inquiryWithImages(2);
    const other = await inquiryWithImagesFor();
    vi.mocked(requireSiteAccess).mockResolvedValue({ user: { id: ownerId }, site, role: "owner" } as never);
    await deleteInquiryAction(site.id, inquiry.id);
    expect(await db.select().from(inquiries).where(eq(inquiries.id, inquiry.id))).toHaveLength(0);
    const left = await db.select().from(inquiryImages);
    expect(left.map((r) => r.id)).toEqual(other);
    expect([...store.objects.keys()].filter((k) => k.startsWith("henvendelser/"))).toHaveLength(1);
    expect(await deleteInquiryImages(db, store, site.id, [])).toBe(0);
  });

  it("bildene slettes når henvendelsen slettes etter tolv måneder", async () => {
    const old = new Date("2025-09-01T10:00:00Z");
    await inquiryWithImages(3, old);
    const now = new Date("2026-11-02T03:00:00Z");
    expect((await runRetention(db, now)).inquiries).toBe(1);
    expect(await db.select().from(inquiryImages)).toHaveLength(3);
    expect(await cleanupInquiryImages(db, store, now)).toBe(3);
    expect(await db.select().from(inquiryImages)).toHaveLength(0);
    expect([...store.objects.keys()].filter((k) => k.startsWith("henvendelser/"))).toEqual([]);
  });

  it("bilder fra skjemaer som aldri ble sendt, slettes etter et døgn", async () => {
    const start = new Date("2026-11-02T10:00:00Z");
    await upload(await tokenFor(site.id, start), JPEG, "ip-a", start);
    const sent = await inquiryWithImages(1, start);
    expect(await cleanupInquiryImages(db, store, new Date(start.getTime() + 23 * 3_600_000))).toBe(0);
    expect(await cleanupInquiryImages(db, store, new Date(start.getTime() + 25 * 3_600_000))).toBe(1);
    // Bildene som hører til en henvendelse, står.
    expect((await db.select().from(inquiryImages)).map((r) => r.id)).toEqual(sent.ids);
  });

  it("bildene slettes fra lageret når nettstedet slettes", async () => {
    await inquiryWithImages(2);
    await deleteSite(db, store, site.id);
    expect([...store.objects.keys()].filter((k) => k.startsWith("henvendelser/"))).toEqual([]);
  });
});

/** Et bilde til en annen henvendelse på samme nettsted. Gir id-ene tilbake. */
async function inquiryWithImagesFor(): Promise<string[]> {
  const token = await tokenFor();
  const { id } = await upload(token, JPEG, "ip-annen");
  const [inquiry] = await db.insert(inquiries).values({ siteId: site.id, name: "Per", message: "Hallo" }).returning();
  await db.update(inquiryImages).set({ inquiryId: inquiry.id }).where(eq(inquiryImages.id, id));
  return [id];
}

describe("Last ned alt", () => {
  it("har bildene under henvendelser/ og viser dem i henvendelser.csv", async () => {
    const { inquiry, ids } = await inquiryWithImages(2);
    // Et bilde som ikke er sendt med et skjema, skal ikke med.
    await upload(await tokenFor());
    await startExport(db, store, site, ownerId);
    const deps = { db, store, fetchPath: async () => new Response("Finnes ikke", { status: 404 }) };
    let job = await runExportStep(deps, site.id, 60_000);
    for (let i = 0; job?.status === "lager" && i < 50; i++) job = await runExportStep(deps, site.id, 60_000);
    expect(job?.status).toBe("ferdig");
    const bytes = new Uint8Array(await new Response(exportStream(store, job!)).arrayBuffer());
    const files = new Map([...readZip(bytes)].map(([name, data]) => [name.slice(job!.root.length + 1), data]));
    const names = ids.map((id) => `henvendelser/${inquiry.id.slice(0, 8)}-${id.slice(0, 8)}.jpg`);
    for (const name of names) expect(files.get(name)).toEqual(JPEG);
    expect([...files.keys()].filter((k) => k.startsWith("henvendelser/"))).toHaveLength(2);
    const csv = new TextDecoder().decode(files.get("tabeller/henvendelser.csv"));
    expect(csv).toContain("Bilder");
    expect(csv).toContain(names[0]);
    expect(new TextDecoder().decode(files.get("LES-MEG.txt"))).toContain("henvendelser/");
  });
});

describe("Personvernerklæringen", () => {
  it("nevner bildene bare når skjemaet har bildefeltet", () => {
    const tekst = (bilderISkjema: boolean) =>
      JSON.stringify(lagPersonvernerklaering({ virksomhet: { navn: "Rør Test", info: demoInfo } as never, type: "nettside", bilderISkjema }));
    expect(tekst(true)).toContain("Legger du ved bilder, lagres de sammen med meldingen.");
    expect(tekst(true)).toContain("Bilder du har lagt ved, slettes sammen med henvendelsen.");
    expect(tekst(false)).not.toContain("Legger du ved bilder");
    expect(tekst(false)).not.toContain("Bilder du har lagt ved");
  });
});
