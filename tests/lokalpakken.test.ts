import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { organizations, sites, users } from "@/db/schema";
import { GET } from "@/app/media/[...key]/route";
import { PageRenderer, SectionPreview, type RenderContext } from "@/components/sections";
import { exampleSection, hasExampleText } from "@/lib/content/examples";
import { formFieldProblems, messageWithAnswers, parseFormAnswers, readFormFields } from "@/lib/content/form-fields";
import { sectionProblems, validatePageContent } from "@/lib/content/registry";
import type { Section } from "@/lib/content/types";
import { mapLinks, youtubeId } from "@/lib/embeds";
import { listMedia, MediaError, saveFile, saveImage } from "@/lib/media";
import { fileSrcPattern, mediaFileKeyPattern, mediaKeysIn, sniffPdf } from "@/lib/media-types";
import { openingHoursSchema, parseDays, parseTimes, visibleSpecialHours } from "@/lib/opening-hours";
import { packs } from "@/lib/packs";
import { readSiteInfo, siteInfoInputSchema } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { setMediaStoreForTests, type MediaStore, type StoredObject } from "@/lib/storage";
import { buildTheme } from "@/lib/themes";

const info = readSiteInfo({
  phone: "32 78 00 00",
  street: "Storgata 1",
  postalCode: "3340",
  city: "Åmot",
  openingHours: [
    { day: "Mandag til fredag", time: "07.00 - 16.00" },
    { day: "Lørdag", time: "10-14" },
    { day: "Søndag", time: "Stengt" },
  ],
  specialHours: [
    { date: "2026-12-24", label: "Julaften", time: "Stengt" },
    { date: "2026-12-27", label: "", time: "11.00 - 15.00" },
    { date: "2026-01-01", label: "Passert", time: "Stengt" },
  ],
});

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  site: { id: "11111111-1111-4111-8111-111111111111", name: "Kafé Åmot", info, schemaType: "CafeOrCoffeeShop" },
  nav: [],
  path: "/",
  preview: false,
  basePath: "",
  shop: false,
  products: [],
  layout: readSiteLayout({}),
  ...over,
});

const render = (section: Section, c = ctx()) =>
  renderToStaticMarkup(createElement(SectionPreview, { section, theme: buildTheme("atelier")!, ctx: c }));

describe("åpningstider", () => {
  it("tolker vanlige norske skrivemåter, og hopper over det som ikke kan tolkes", () => {
    expect(parseDays("Mandag til fredag")).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(parseDays("man-fre")).toHaveLength(5);
    expect(parseDays("Lørdag og søndag")).toEqual(["Saturday", "Sunday"]);
    expect(parseDays("Hverdager")).toHaveLength(5);
    expect(parseDays("Etter avtale")).toBeNull();
    expect(parseTimes("07.00 - 16.00")).toEqual([{ opens: "07:00", closes: "16:00" }]);
    expect(parseTimes("10-14, 16:30 til 22")).toEqual([
      { opens: "10:00", closes: "14:00" },
      { opens: "16:30", closes: "22:00" },
    ]);
    expect(parseTimes("Stengt")).toEqual([]);
    expect(parseTimes("Kun akutt")).toBeNull();
    expect(parseTimes("25-26")).toBeNull();
  });

  it("gir Google samme tider som siden viser, og avvikende dager som ikke er passert", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const schema = openingHoursSchema(info, now);
    expect(schema.openingHoursSpecification).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "07:00", closes: "16:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: "10:00", closes: "14:00" },
    ]);
    expect(schema.specialOpeningHoursSpecification).toEqual([
      { "@type": "OpeningHoursSpecification", validFrom: "2026-12-24", validThrough: "2026-12-24", opens: "00:00", closes: "00:00" },
      { "@type": "OpeningHoursSpecification", validFrom: "2026-12-27", validThrough: "2026-12-27", opens: "11:00", closes: "15:00" },
    ]);
    // På siden vises bare de neste 60 dagene.
    expect(visibleSpecialHours(info, now).map((s) => s.date)).toEqual(["2026-12-24", "2026-12-27"]);
    expect(visibleSpecialHours(info, new Date("2026-09-01T12:00:00Z"))).toEqual([]);
  });

  it("godtar ikke ugyldige datoer, og eldre info uten avvikende dager er fortsatt gyldig", () => {
    expect(readSiteInfo({ phone: "1" }).specialHours).toEqual([]);
    expect(siteInfoInputSchema.safeParse({ specialHours: [{ date: "2026-02-31", time: "Stengt" }] }).success).toBe(false);
    expect(siteInfoInputSchema.safeParse({ specialHours: [{ date: "2026-12-24", time: "" }] }).success).toBe(false);
  });

  it("viser tidene fra innstillingene, og ingenting på nettstedet når de mangler", () => {
    const section = exampleSection("apningstider", "standard");
    const html = render(section);
    expect(html).toContain("Mandag til fredag");
    // Avvikende dager vises bare de neste 60 dagene. Testes med fast dato over, ikke her.
    expect(html).toContain('<h2 class="ng-h ng-h2 mb-6">Åpningstider</h2>');
    const empty = ctx({ site: { ...ctx().site, info: readSiteInfo({}) } });
    expect(render(section, empty)).not.toContain("<section");
    expect(render(section, { ...empty, preview: true })).toContain("Legg inn åpningstidene under Innstillinger");
  });
});

describe("kart og video", () => {
  it("laster ingenting fra Google eller YouTube før den besøkende trykker", () => {
    const kart = render({ id: "k", type: "kart", variant: "kart", props: { overskrift: "Finn veien hit", tekst: "" } });
    expect(kart).not.toContain("<iframe");
    expect(kart).toContain(">Vis kart</button>");
    expect(kart).toContain(mapLinks("Storgata 1, 3340 Åmot").google.replace(/&/g, "&amp;"));
    expect(kart).toContain("openstreetmap.org/search");

    const video = render({ id: "v", type: "video", variant: "standard", props: { lenke: "https://youtu.be/dQw4w9WgXcQ", tittel: "Slik baker vi", tekst: "" } });
    expect(video).not.toContain("<iframe");
    expect(video).not.toContain("ytimg");
    expect(video).toContain("Spill av video: Slik baker vi");
  });

  it("godtar bare YouTube-lenker, og krever tittel for skjermlesere", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    for (const bad of ["https://vimeo.com/123", "javascript:alert(1)", "https://youtube.com.ond.no/watch?v=dQw4w9WgXcQ", "https://youtu.be/kort"]) {
      expect(youtubeId(bad), bad).toBeNull();
    }
    const section = (lenke: string, tittel: string): Section => ({ id: "v", type: "video", variant: "standard", props: { lenke, tittel } });
    expect(sectionProblems(section("https://vimeo.com/123", "Video"))).toEqual(["Lenke til videoen på YouTube: lim inn en lenke til en video på YouTube"]);
    expect(sectionProblems(section("https://youtu.be/dQw4w9WgXcQ", ""))).toHaveLength(1);
    expect(sectionProblems(section("https://youtu.be/dQw4w9WgXcQ", "Slik baker vi"))).toEqual([]);
  });
});

describe("ansatte", () => {
  it("viser navn, rolle og kontakt, og plassholderne stopper publisering", () => {
    const html = render({
      id: "a",
      type: "ansatte",
      variant: "liste",
      props: { overskrift: "Folkene bak", personer: [{ navn: "Kari Nordmann", rolle: "Daglig leder", epost: "kari@eksempel.no", telefon: "900 00 000" }] },
    });
    expect(html).toContain("<h3");
    expect(html).toContain("Kari Nordmann");
    expect(html).toContain('href="mailto:kari@eksempel.no"');
    expect(html).toContain('href="tel:90000000"');
    expect(hasExampleText(exampleSection("ansatte", "kort"))).toBe(true);
    const bad: Section = { id: "a", type: "ansatte", variant: "kort", props: { overskrift: "Oss", personer: [{ navn: "Kari", epost: "ikke-epost" }] } };
    expect(validatePageContent({ sections: [bad] }, "draft").ok).toBe(false);
  });
});

describe("seksjoner som er slått av", () => {
  it("vises ikke på nettstedet og stopper ikke publisering, men kan aldri være ugyldige", () => {
    const off: Section = { ...exampleSection("video", "standard", "v"), hidden: true };
    expect(validatePageContent({ sections: [off] }).ok).toBe(true);
    expect(validatePageContent({ sections: [{ ...off, hidden: false }] }).ok).toBe(false);
    expect(validatePageContent({ sections: [{ ...off, props: { lenke: "javascript:alert(1)", tittel: "x" } }] }).ok).toBe(false);

    const content = { seo: {}, sections: [off, { id: "t", type: "tekst", variant: "standard", props: { overskrift: "Velkommen", brodtekst: "Hei" } } as Section] };
    const live = renderToStaticMarkup(createElement(PageRenderer, { content, theme: buildTheme("atelier")!, ctx: ctx({ preview: true }) }));
    expect(live).not.toContain("Spill av");
    // Første synlige seksjon får H1, også når en avslått seksjon ligger over.
    expect(live).toContain("<h1");
    const editor = renderToStaticMarkup(
      createElement(PageRenderer, { content, theme: buildTheme("atelier")!, ctx: ctx({ preview: true }), editor: { selectedId: null } }),
    );
    expect(editor).toContain("(slått av)");
  });
});

describe("egne felt i kontaktskjemaet", () => {
  const props = {
    overskrift: "Kontakt",
    skjemafelt: [
      { etikett: "Adresse", felttype: "tekst", pakrevd: "ja" },
      { etikett: "Hva gjelder det?", felttype: "valg", valg: "Bad\nKjøkken\n\nBad", pakrevd: "nei" },
      { etikett: "Når passer det?", felttype: "dato", pakrevd: "nei" },
      { etikett: "Jeg vil bli ringt", felttype: "avkryssing", pakrevd: "nei" },
      { etikett: "Telefon på jobb", felttype: "telefon", pakrevd: "nei" },
      { etikett: "", felttype: "tekst", pakrevd: "ja" },
    ],
  };
  const fields = readFormFields(props);

  it("leser feltene i rekkefølge, og hopper over felt uten navn", () => {
    expect(fields.map((f) => f.label)).toEqual(["Adresse", "Hva gjelder det?", "Når passer det?", "Jeg vil bli ringt", "Telefon på jobb"]);
    expect(fields[1].options).toEqual(["Bad", "Kjøkken"]);
  });

  it("sjekker svarene på serveren og sier hvilket felt som er feil", () => {
    expect(parseFormAnswers(fields, {})).toMatchObject({ ok: false, field: "felt-0", message: "Fyll ut «Adresse»" });
    expect(parseFormAnswers(fields, { "felt-0": "Storgata 1", "felt-1": "Garasje" })).toMatchObject({ ok: false, field: "felt-1" });
    expect(parseFormAnswers(fields, { "felt-0": "Storgata 1", "felt-2": "2026-02-31" })).toMatchObject({ ok: false, field: "felt-2" });
    expect(parseFormAnswers(fields, { "felt-0": "Storgata 1", "felt-4": "12" })).toMatchObject({ ok: false, field: "felt-4" });
    expect(parseFormAnswers(fields, { "felt-0": "x".repeat(201) })).toMatchObject({ ok: false, field: "felt-0" });

    const ok = parseFormAnswers(fields, { "felt-0": " Storgata 1 ", "felt-1": "Bad", "felt-2": "2026-12-01", "felt-3": "ja" });
    expect(ok).toEqual({
      ok: true,
      answers: [
        { label: "Adresse", value: "Storgata 1" },
        { label: "Hva gjelder det?", value: "Bad" },
        { label: "Når passer det?", value: "01.12.2026" },
        { label: "Jeg vil bli ringt", value: "Ja" },
      ],
    });
    if (ok.ok) expect(messageWithAnswers("Lekker under vasken", ok.answers)).toBe("Lekker under vasken\n\nAdresse: Storgata 1\nHva gjelder det?: Bad\nNår passer det?: 01.12.2026\nJeg vil bli ringt: Ja");
  });

  it("krever valg i en valgliste før publisering, og eldre kontaktseksjoner uten felt er gyldige", () => {
    expect(formFieldProblems({ skjemafelt: [{ etikett: "Type", felttype: "valg", valg: " \n" }] })).toHaveLength(1);
    const section: Section = { id: "k", type: "kontakt", variant: "skjema", props: { overskrift: "Kontakt", skjemafelt: [{ etikett: "Type", felttype: "valg", valg: "", pakrevd: "nei" }] } };
    expect(validatePageContent({ sections: [section] }, "draft").ok).toBe(true);
    expect(validatePageContent({ sections: [section] }).ok).toBe(false);
    expect(validatePageContent({ sections: [{ id: "k", type: "kontakt", variant: "skjema", props: { overskrift: "Kontakt" } }] }).ok).toBe(true);
  });

  it("viser feltene med synlige etiketter, og merker valgfrie felt i teksten", () => {
    const html = render({ id: "k", type: "kontakt", variant: "skjema", props }, ctx({ preview: true }));
    expect(html).toContain('name="section" value="k"');
    expect(html).toMatch(/<span class="mb-1 block font-medium">Adresse<\/span><input[^>]*required=""[^>]*name="felt-0"/);
    expect(html).toContain("Hva gjelder det?<span");
    expect(html).toContain("(valgfritt)");
    expect(html).toMatch(/<input type="date"[^>]*name="felt-2"/);
    expect(html).toMatch(/<input type="checkbox"[^>]*name="felt-3" value="ja"/);
  });
});

describe("PDF-meny", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n1 0 obj");
  const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");
  let db: Db;
  let siteId: string;
  let userId: string;
  const objects = new Map<string, StoredObject>();
  const store: MediaStore = {
    async put(key, data, contentType) {
      objects.set(key, { body: data, contentType, size: data.byteLength });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list() {
      return [];
    },
  };

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db.insert(sites).values({ orgId: org.id, name: "S", slug: "s", industryPack: "kafe", theme: demoTheme }).returning();
    siteId = site.id;
    userId = user.id;
  });

  it("tar bare imot ekte PDF-er, og holder dem utenfor bildebiblioteket", async () => {
    expect(sniffPdf(PDF)).toBe(true);
    expect(sniffPdf(HTML)).toBe(false);
    await expect(saveFile(db, store, { siteId, userId, bytes: HTML, name: "meny.pdf" })).rejects.toThrow(MediaError);
    await expect(saveFile(db, store, { siteId, userId, bytes: new Uint8Array(10 * 1024 * 1024 + 1), name: "x.pdf" })).rejects.toThrow(
      "større enn 10 MB",
    );
    const saved = await saveFile(db, store, { siteId, userId, bytes: PDF, name: 'Meny "høst"\n.pdf' });
    expect(saved.src).toMatch(fileSrcPattern);
    expect(saved.name).toBe("Meny høst.pdf");
    const key = saved.src.replace("/media/", "");
    expect(objects.get(key)?.contentType).toBe("application/pdf");
    expect(mediaFileKeyPattern.test(key)).toBe(true);
    expect(mediaKeysIn({ fil: saved })).toEqual(new Set([key]));

    await saveImage(db, store, { siteId, userId, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]) });
    expect((await listMedia(db, siteId)).every((m) => !m.src.endsWith(".pdf"))).toBe(true);

    setMediaStoreForTests(store);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ key: key.split("/") }) }).finally(() => setMediaStoreForTests(null));
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("viser lenken med størrelse, og godtar ikke filer utenfor eget lager", () => {
    const src = `/media/${siteId}/22222222-2222-4222-8222-222222222222.pdf`;
    const section: Section = { id: "f", type: "filer", variant: "standard", props: { overskrift: "Meny", filer: [{ tittel: "Se menyen", fil: { src, name: "meny.pdf", size: 1_300_000 } }] } };
    expect(validatePageContent({ sections: [section] }).ok).toBe(true);
    const html = render(section);
    expect(html).toContain(`href="${src}"`);
    expect(html).toContain("PDF, 1,2 MB");
    const evil = { ...section, props: { ...section.props, filer: [{ tittel: "x", fil: { src: "https://ond.no/x.pdf", name: "x" } }] } };
    expect(validatePageContent({ sections: [evil] }, "draft").ok).toBe(false);
  });
});

describe("bransjepakkene", () => {
  const types = (key: string) =>
    packs[key].pages({ name: "Test AS", city: "Åmot" }).flatMap((p) => p.content.sections.map((s) => `${p.path}:${s.type}${s.hidden ? ":av" : ""}`));

  it("gir kafé, restaurant og bakeri åpningstider, kart og PDF-meny", () => {
    for (const key of ["kafe", "restaurant", "bakeri"]) {
      // Menyen ligger på prissiden (/meny eller /priser) og er slått av til PDF-en er lastet opp.
      expect(types(key), key).toEqual(expect.arrayContaining(["/:apningstider", "/kontakt:kart"]));
      expect(types(key).some((t) => /^\/(meny|priser):filer:av$/.test(t)), key).toBe(true);
    }
  });

  it("gir håndverk og frisør ansatte, og håndverk egne felt i skjemaet", () => {
    expect(types("rorlegger")).toContain("/om-oss:ansatte");
    expect(types("frisor")).toEqual(expect.arrayContaining(["/om-oss:ansatte", "/:apningstider"]));
    const kontakt = packs.rorlegger.pages({ name: "Test AS", city: "Åmot" }).find((p) => p.path === "/kontakt")!.content.sections[0];
    expect(readFormFields(kontakt.props).map((f) => f.type)).toEqual(["tekst", "dato"]);
    expect(types("regnskap")).toContain("/om-oss:ansatte");
  });
});
