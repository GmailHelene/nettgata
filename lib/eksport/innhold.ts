import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  bookingExceptions,
  bookingHours,
  bookings,
  bookingServices,
  bookingStaff,
  bookingStaffServices,
  inquiries,
  media,
  orderLines,
  orders,
  pages,
  pageVersions,
  productCategories,
  products,
  productVariants,
  sites,
} from "@/db/schema";
import { readAnswers } from "@/lib/content/form-fields";
import { csvKroner, toCsv } from "@/lib/csv";
import { readBookingSettings } from "@/lib/egen-booking/settings";
import { HELP_CONTACT_EMAIL } from "@/lib/hjelp/artikler";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { subscribersCsv } from "@/lib/nyhetsbrev/subscribers";
import { listOrders, ordersCsv, parseOrderQuery, productsCsv } from "@/lib/shop/admin";
import { customersCsv } from "@/lib/shop/customers";
import { readShopSettings } from "@/lib/shop/settings";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";

/**
 * Innholdet i eksporten som JSON og CSV, og LES-MEG.txt. Ingen hemmeligheter: betalingsnøkler, Bring- og
 * Fiken-oppsett, abonnementet hos Stripe og varslingsadresser er ikke med. Butikkinnstillingene leses gjennom
 * readShopSettings, som bare gir det kassen bruker.
 */

type Site = typeof sites.$inferSelect;

export const dataFiles = [
  "innhold/nettsted.json",
  "innhold/sider.json",
  "innhold/bilder-og-filer.json",
  "innhold/varer.json",
  "innhold/booking.json",
  "tabeller/varer.csv",
  "tabeller/ordre.csv",
  "tabeller/ordrelinjer.csv",
  "tabeller/kunder.csv",
  "tabeller/henvendelser.csv",
  "tabeller/nyhetsbrev-abonnenter.csv",
  "tabeller/bookinger.csv",
] as const;
export type DataFile = (typeof dataFiles)[number];

const SHOP_ONLY = new Set<DataFile>(["innhold/varer.json", "tabeller/varer.csv", "tabeller/ordre.csv", "tabeller/ordrelinjer.csv", "tabeller/kunder.csv"]);

/** Filene som hører med for dette nettstedet. Butikkfilene bare for nettbutikker. */
export function dataFilesFor(site: Pick<Site, "kind">): DataFile[] {
  return dataFiles.filter((name) => site.kind === "nettbutikk" || !SHOP_ONLY.has(name));
}

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const text = (value: string) => new TextEncoder().encode(value);

export async function buildDataFile(db: Db, site: Site, name: DataFile): Promise<Uint8Array> {
  switch (name) {
    case "innhold/nettsted.json":
      return json({
        navn: site.name,
        adresse: site.slug,
        type: site.kind,
        bransjepakke: site.industryPack,
        opprettet: site.createdAt.toISOString(),
        kontaktinfo: readSiteInfo(site.info),
        tema: site.theme,
        utseende: readSiteLayout(site.layout),
        omdirigeringer: site.redirects ?? [],
        ...(site.kind === "nettbutikk" && { butikk: readShopSettings(site.shop) }),
        timebestilling: readBookingSettings(site.booking),
      });
    case "innhold/sider.json": {
      const rows = await db
        .select({ page: pages, published: pageVersions })
        .from(pages)
        .leftJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
        .where(eq(pages.siteId, site.id))
        .orderBy(asc(pages.sortOrder), asc(pages.path));
      return json(
        rows.map(({ page, published }) => ({
          tittel: page.title,
          adresse: page.path,
          iMenyen: page.showInMenu,
          rekkefolge: page.sortOrder,
          opprettet: page.createdAt.toISOString(),
          publisert: published ? { versjon: published.number, tidspunkt: published.createdAt.toISOString(), tittel: published.title, innhold: published.content } : null,
          kladd: page.draft,
        })),
      );
    }
    case "innhold/bilder-og-filer.json": {
      const rows = await db.select().from(media).where(eq(media.siteId, site.id)).orderBy(asc(media.createdAt));
      return json(
        rows.map((m) => ({
          fil: mediaFileName(m),
          adresseIInnholdet: `/media/${m.key}`,
          type: m.contentType,
          beskrivelse: m.contentType === "application/pdf" ? "" : m.alt,
          bredde: m.width,
          hoyde: m.height,
          bytes: m.size,
          lastetOpp: m.createdAt.toISOString(),
        })),
      );
    }
    case "innhold/varer.json": {
      const [categoryRows, productRows] = await Promise.all([
        db.select().from(productCategories).where(eq(productCategories.siteId, site.id)).orderBy(asc(productCategories.sortOrder)),
        db.select().from(products).where(eq(products.siteId, site.id)).orderBy(asc(products.sortOrder), asc(products.name)),
      ]);
      const variants = productRows.length
        ? await db.select().from(productVariants).where(inArray(productVariants.productId, productRows.map((p) => p.id))).orderBy(asc(productVariants.position))
        : [];
      const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
      return json({
        kategorier: categoryRows.map((c) => ({ navn: c.name, adresse: c.slug })),
        varer: productRows.map((p) => ({
          navn: p.name,
          adresse: p.slug,
          status: p.status,
          kategori: p.categoryId ? (categoryName.get(p.categoryId) ?? null) : null,
          beskrivelse: p.description,
          bilder: p.images,
          valg: p.options,
          mvaSats: p.vatRate,
          vektGram: p.weightGrams,
          varianter: variants
            .filter((v) => v.productId === p.id)
            .map((v) => ({ valg: v.optionValues, varenummer: v.sku, prisOre: v.priceOre, lager: v.stock, vektGram: v.weightGrams })),
        })),
      });
    }
    case "innhold/booking.json": {
      const [services, staff, hours, exceptions] = await Promise.all([
        db.select().from(bookingServices).where(eq(bookingServices.siteId, site.id)).orderBy(asc(bookingServices.sortOrder)),
        db.select().from(bookingStaff).where(eq(bookingStaff.siteId, site.id)).orderBy(asc(bookingStaff.sortOrder)),
        db.select().from(bookingHours).where(eq(bookingHours.siteId, site.id)),
        db.select().from(bookingExceptions).where(eq(bookingExceptions.siteId, site.id)),
      ]);
      const links = staff.length ? await db.select().from(bookingStaffServices).where(inArray(bookingStaffServices.staffId, staff.map((s) => s.id))) : [];
      const strip = <T extends Record<string, unknown>>(row: T) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== "siteId"));
      return json({
        innstillinger: readBookingSettings(site.booking),
        tjenester: services.map(strip),
        ansatte: staff.map((s) => ({ ...strip(s), tjenester: links.filter((l) => l.staffId === s.id).map((l) => l.serviceId) })),
        arbeidstider: hours.map(strip),
        unntak: exceptions.map(strip),
      });
    }
    case "tabeller/varer.csv":
      return text(await productsCsv(db, site.id));
    case "tabeller/ordre.csv":
      return text(ordersCsv(await listOrders(db, site.id, parseOrderQuery({}), 100_000)));
    case "tabeller/ordrelinjer.csv": {
      const rows = await db
        .select({ number: orders.number, line: orderLines })
        .from(orderLines)
        .innerJoin(orders, eq(orderLines.orderId, orders.id))
        .where(eq(orders.siteId, site.id))
        .orderBy(asc(orders.number));
      return text(
        toCsv(
          ["Ordrenr", "Varenavn", "Variant", "Varenummer", "Antall", "Pris per stk (kr)", "MVA-sats", "Sum (kr)"],
          rows.map(({ number, line }) => [number, line.name, line.variantLabel, line.sku, line.quantity, csvKroner(line.unitPriceOre), line.vatRate, csvKroner(line.totalOre)]),
        ),
      );
    }
    case "tabeller/kunder.csv":
      return text(await customersCsv(db, site.id));
    case "tabeller/henvendelser.csv": {
      const rows = await db.select().from(inquiries).where(eq(inquiries.siteId, site.id)).orderBy(desc(inquiries.createdAt));
      return text(
        toCsv(
          ["Dato", "Navn", "E-post", "Telefon", "Melding", "Svar i egne felt", "Side", "Lest"],
          rows.map((q) => [
            formatOsloDateTime(q.createdAt),
            q.name,
            q.email,
            q.phone,
            q.message,
            readAnswers(q.answers)
              .map((a) => `${a.label}: ${a.value}`)
              .join("\n"),
            q.pagePath,
            q.readAt ? "Ja" : "Nei",
          ]),
        ),
      );
    }
    case "tabeller/nyhetsbrev-abonnenter.csv":
      return text(await subscribersCsv(db, site.id));
    case "tabeller/bookinger.csv": {
      const rows = await db.select().from(bookings).where(eq(bookings.siteId, site.id)).orderBy(asc(bookings.startsAt));
      return text(
        toCsv(
          ["Start", "Slutt", "Tjeneste", "Ansatt", "Pris (kr)", "Kunde", "E-post", "Telefon", "Melding", "Status", "Bestilt"],
          rows.map((b) => [
            formatOsloDateTime(b.startsAt),
            formatOsloDateTime(b.endsAt),
            b.serviceName,
            b.staffName,
            b.priceOre === null ? "" : csvKroner(b.priceOre),
            b.customerName,
            b.customerEmail,
            b.customerPhone,
            b.message,
            b.status,
            formatOsloDateTime(b.createdAt),
          ]),
        ),
      );
    }
  }
}

/** Filnavnet til et bilde eller en fil i ZIP-en. Bilder heter som i lageret, PDF-er får navnet de ble lastet opp med. */
export function mediaFileName(m: Pick<typeof media.$inferSelect, "id" | "key" | "contentType" | "alt">): string {
  const base = m.key.split("/").pop() ?? m.key;
  if (m.contentType !== "application/pdf") return `bilder/${base}`;
  const name = (m.alt || "fil.pdf")
    .replace(/\.pdf$/i, "")
    .replace(/[^\p{L}\p{N} ._-]+/gu, "")
    .trim()
    .slice(0, 80);
  return `filer/${name || "fil"}-${m.id.slice(0, 8)}.pdf`;
}

/** Stiene på nettstedet som lagres som statiske sider. */
export async function exportedPaths(db: Db, site: Site): Promise<string[]> {
  const published = await db
    .select({ path: pages.path })
    .from(pages)
    .where(and(eq(pages.siteId, site.id), isNotNull(pages.publishedVersionId)))
    .orderBy(asc(pages.sortOrder), asc(pages.path));
  const paths = published.map((p) => p.path);
  if (paths.length === 0) return [];
  paths.push("/personvern");
  if (site.kind === "nettbutikk") {
    paths.push("/angrerett", "/produkter");
    const active = await db
      .select({ slug: products.slug })
      .from(products)
      .where(and(eq(products.siteId, site.id), eq(products.status, "active")))
      .orderBy(asc(products.sortOrder));
    paths.push(...active.map((p) => `/produkt/${p.slug}`));
  }
  return [...new Set(paths)];
}

/** LES-MEG.txt. Skrives sist, så den kan nevne sider som ikke lot seg lagre. */
export function readme(o: { site: Site; createdAt: Date; files: DataFile[]; pages: number; skipped: string[] }): Uint8Array {
  const shop = o.site.kind === "nettbutikk";
  const has = (name: DataFile) => o.files.includes(name);
  const tables = [
    has("tabeller/varer.csv") && "varer.csv: alle varene, én rad per variant",
    has("tabeller/ordre.csv") && "ordre.csv: alle ordrene",
    has("tabeller/ordrelinjer.csv") && "ordrelinjer.csv: varene i hver ordre",
    has("tabeller/kunder.csv") && "kunder.csv: kundene som har handlet",
    "henvendelser.csv: meldingene fra kontaktskjemaet",
    "nyhetsbrev-abonnenter.csv: påmeldte til nyhetsbrevet, også de som har meldt seg av",
    "bookinger.csv: timene som er bestilt",
  ].filter(Boolean);
  const lines = [
    `Alt fra ${o.site.name}`,
    `Lastet ned fra Nettgata ${formatOsloDateTime(o.createdAt)}.`,
    "",
    "Dette er en kopi av nettstedet og alle dataene dine. Det er ditt, og du kan bruke det hvor du vil.",
    "",
    "",
    "HVA SOM LIGGER HVOR",
    "",
    "nettsted/",
    o.pages > 0
      ? `  De publiserte sidene (${o.pages}) som vanlige HTML-filer, med CSS, fonter og bilder. Åpne nettsted/index.html i nettleseren for å se forsiden. Hele mappen kan legges ut hos et annet webhotell som den er.`
      : "  Tom. Ingen sider var publisert da filen ble laget.",
    `  ${shop ? "Handlekurv, kasse, " : ""}kontaktskjema, timebestilling og påmelding til nyhetsbrev trenger en server og virker ikke i kopien. Lenkene til dem går til det levende nettstedet så lenge det finnes.`,
    "",
    "innhold/",
    "  Alt innholdet som JSON, som kan leses av andre systemer.",
    "  nettsted.json har navn, kontaktinfo, tema og innstillinger.",
    "  sider.json har alle sidene seksjon for seksjon, både den publiserte utgaven og kladden.",
    "  bilder-og-filer.json forteller hva hvert bilde viser (alt-teksten), og hvilken adresse det har i sider.json.",
    ...(has("innhold/varer.json") ? ["  varer.json har varene med beskrivelse, bilder, valg og varianter."] : []),
    "  booking.json har tjenestene, de ansatte og arbeidstidene i timebestillingen.",
    "",
    "bilder/ og filer/",
    "  Bildene i den størrelsen de ble lagret i, og PDF-filene slik de ble lastet opp.",
    "",
    "tabeller/",
    "  Regneark (CSV) som åpnes i Excel, Numbers og Google Regneark:",
    ...tables.map((t) => `  ${t}`),
    "  Filene har semikolon som skilletegn og desimalkomma, slik norsk Excel vil ha det. Dobbeltklikk for å åpne.",
    "",
    "",
    "PERSONOPPLYSNINGER",
    "",
    "Filen har personopplysninger om kundene dine, for eksempel navn, e-post, telefon, adresser, ordre, henvendelser, bookinger og abonnenter.",
    "Du er behandlingsansvarlig for dem. Lagre filen trygt, del den bare med dem som trenger den, og slett den når du ikke trenger den lenger.",
    ...(o.skipped.length
      ? ["", "", "SIDER SOM IKKE BLE MED", "", "Disse sidene svarte ikke da filen ble laget, og ligger ikke i nettsted/:", ...o.skipped.map((p) => `  ${p}`)]
      : []),
    "",
    "",
    `Spørsmål? Send en e-post til ${HELP_CONTACT_EMAIL}.`,
    "",
  ];
  // Windows sin Notisblokk viser linjeskiftene riktig med CRLF.
  return text(lines.join("\r\n"));
}
