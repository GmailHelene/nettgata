import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import type { PageContent } from "@/lib/content/types";
import type { Theme } from "@/lib/theme";
import type { SiteInfo } from "@/lib/site-info";
import type { ShopSettings } from "@/lib/shop/settings";
import type { SiteLayout } from "@/lib/site-layout";
import type { NotificationSettings } from "@/lib/notifications";
import type { SiteBilling } from "@/lib/billing/state";
import type { BookingSettings } from "@/lib/egen-booking/settings";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["owner", "editor", "developer"]);
export const siteKindEnum = pgEnum("site_kind", ["nettside", "nettbutikk"]);
export const domainStatusEnum = pgEnum("domain_status", ["pending", "active"]);
/** apex: firma.no (sender alltid videre til www). www: www.firma.no. sub: et underdomene som butikk.firma.no. */
export const domainKindEnum = pgEnum("domain_kind", ["apex", "www", "sub"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  /**
   * Tofaktorinnlogging. Hemmeligheten er kryptert med en nøkkel avledet av SESSION_SECRET (lib/totp),
   * og gjelder først fra totpEnabledAt. Byttes SESSION_SECRET, må tofaktor settes opp på nytt.
   */
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Siste brukte tidssteg, så samme kode ikke kan brukes to ganger. */
  totpLastStep: integer("totp_last_step"),
  /** HMAC av reservekodene som ikke er brukt ennå. */
  totpRecovery: jsonb("totp_recovery").$type<string[]>().notNull().default([]),
  /**
   * Når e-postadressen ble bekreftet. Selvbetjente kontoer (/studio/registrer) må bekrefte før de kan lage
   * nettsted, og ubekreftede kontoer slettes etter sju dager (lib/selvbetjening.ts). Brukere fra før
   * migrering 0017 og brukere som kom via invitasjon, regnes som bekreftet.
   */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Kunden: en bedrift, forening eller privatperson som eier ett eller flere nettsteder. */
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  orgnr: text("orgnr"),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const sites = pgTable("sites", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Gir gratis underdomene: <slug>.<SITES_ROOT_DOMAIN> */
  slug: text("slug").notNull().unique(),
  kind: siteKindEnum("kind").notNull().default("nettside"),
  industryPack: text("industry_pack").notNull(),
  theme: jsonb("theme").$type<Theme>().notNull(),
  /** Kontaktinfo som én kilde. Les alltid via readSiteInfo(), som fyller inn standardverdier. */
  info: jsonb("info").$type<Partial<SiteInfo>>().notNull().default({}),
  /** Butikkinnstillinger: frakt, betalingsmåter og kjøpsvilkår. Les via readShopSettings(). */
  shop: jsonb("shop").$type<Partial<ShopSettings>>().notNull().default({}),
  /** Logo, toppstripe og bunntekst. Les via readSiteLayout(). */
  layout: jsonb("layout").$type<Partial<SiteLayout>>().notNull().default({}),
  /** Hvem som får varsel på e-post om nye ordre og henvendelser. Les via readNotificationSettings(). */
  notifications: jsonb("notifications").$type<Partial<NotificationSettings>>().notNull().default({}),
  /** Abonnementet hos Stripe, eller «fakturert utenom Stripe». Les via readBilling(), skriv bare som sammenslåing. */
  billing: jsonb("billing").$type<Partial<SiteBilling>>().notNull().default({}),
  /** 301-omdirigeringer når kunden flytter fra en gammel nettside: fra gammel sti til ny sti eller adresse. */
  redirects: jsonb("redirects").$type<{ from: string; to: string }[]>().notNull().default([]),
  /** Innstillinger for egen timebestilling: varsel, avbestillingsfrist, dager fram i tid. Les via readBookingSettings(). */
  booking: jsonb("booking").$type<Partial<BookingSettings>>().notNull().default({}),
  /**
   * Laget av kunden selv (selvbetjening), ikke av plattformadmin. Bare slike nettsteder teller mot grensene for
   * ubetalte nettsteder og lagringsplass, og bare de kan slettes etter lang tid uten aktivitet (lib/selvbetjening.ts).
   */
  selfServe: boolean("self_serve").notNull().default(false),
  /** Sist noen andre enn plattformadmin var innom nettstedet i studioet, eller eieren logget inn. */
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  /** Når eieren fikk varsel om at et ubetalt nettsted uten aktivitet blir slettet. Nullstilles ved aktivitet. */
  inactivityWarnedAt: timestamp("inactivity_warned_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Invitasjon til et nettsted. Lenken sendes på e-post, og bare en hash av nøkkelen lagres, aldri selve nøkkelen. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_site_idx").on(t.siteId)],
);

export const domains = pgTable(
  "domains",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Alltid lagret med små bokstaver og uten port. Internasjonale tegn som punycode (xn--). */
    hostname: text("hostname").notNull().unique(),
    kind: domainKindEnum("kind").notNull().default("sub"),
    /**
     * Unik peker for dette domenet: kunden peker www til <token>.<CUSTOM_DOMAIN_TARGET>.
     * Vi aktiverer bare når DNS peker nøyaktig hit, så ingen kan ta et domene de ikke eier.
     */
    token: text("token"),
    /** Id hos Cloudflare for SaaS (custom hostname). */
    cfHostnameId: text("cf_hostname_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: domainStatusEnum("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    /** Forklaring til kunden fra siste sjekk, for eksempel hva DNS peker til nå. */
    lastError: text("last_error"),
    /** Når et aktivt domene sluttet å peke hit. Det deaktiveres etter en frist, ikke ved første feil. */
    failingSince: timestamp("failing_since", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("domains_site_idx").on(t.siteId), index("domains_status_checked_idx").on(t.status, t.checkedAt)],
);

export const pages = pgTable(
  "pages",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** "/" for forsiden, ellers "/tjenester" osv. */
    path: text("path").notNull(),
    title: text("title").notNull(),
    draft: jsonb("draft").$type<PageContent>().notNull(),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Versjonen som vises live. Null betyr at siden aldri er publisert. */
    publishedVersionId: uuid("published_version_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    showInMenu: boolean("show_in_menu").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pages_site_path_idx").on(t.siteId, t.path)],
);

/** Hver publisering lagres som en uforanderlig versjon. Tilbakerulling peker bare på en eldre versjon. */
export const pageVersions = pgTable(
  "page_versions",
  {
    id: id(),
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<PageContent>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("page_versions_page_number_idx").on(t.pageId, t.number)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_site_idx").on(t.siteId, t.createdAt)],
);

/** Henvendelser fra kontaktskjemaet på kundens nettsted. */
export const inquiries = pgTable(
  "inquiries",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    message: text("message").notNull(),
    /**
     * Svarene i de egne feltene i skjemaet (lib/content/form-fields.ts), i samme rekkefølge som i skjemaet.
     * Null for eldre henvendelser, der svarene står nederst i meldingen.
     */
    answers: jsonb("answers").$type<{ label: string; value: string }[] | null>(),
    pagePath: text("page_path"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("inquiries_site_idx").on(t.siteId, t.createdAt)],
);

/**
 * Bilder den besøkende legger ved en henvendelse (felttypen «bilder», lib/henvendelser/bilder.ts). Lastes opp før
 * skjemaet sendes, så raden finnes uten henvendelse en stund. upload_id er koden i opplastingsnøkkelen, og bare den
 * samme nøkkelen kan knytte bildene til henvendelsen. Filene ligger privat i lageret under henvendelser/<siteId>/.
 * Slettes henvendelsen, blir inquiry_id null, og ryddejobben sletter filen og raden.
 */
export const inquiryImages = pgTable(
  "inquiry_images",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    uploadId: text("upload_id").notNull(),
    key: text("key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("inquiry_images_inquiry_idx").on(t.inquiryId), index("inquiry_images_upload_idx").on(t.siteId, t.uploadId), index("inquiry_images_created_idx").on(t.createdAt)],
);

/**
 * Hendelser for rate limiting. Ligger i databasen fordi Workers ikke deler minne
 * mellom forespørsler. Gamle rader ryddes bort ved neste sjekk.
 */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: id(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rate_limit_key_idx").on(t.key, t.createdAt)],
);

/** Opplastede bilder. Selve filen ligger i R2 (lokalt: .data/media) under nøkkelen <siteId>/<id>.<ext>. */
export const media = pgTable(
  "media",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt").notNull().default(""),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("media_site_idx").on(t.siteId, t.createdAt)],
);

// ---------- Nettbutikk ----------
// Alle beløp lagres i øre (heltall) inkludert MVA, slik norske forbrukerpriser skal vises.

export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);
export const orderStatusEnum = pgEnum("order_status", ["pending_payment", "paid", "fulfilled", "cancelled", "refunded"]);

export const productCategories = pgTable(
  "product_categories",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("product_categories_site_slug_idx").on(t.siteId, t.slug)],
);

export type ProductOption = { name: string; values: string[] };
/** focus er fokuspunktet i prosent (se lib/media-types). Lagres i jsonb, så det trengs ingen migrering. */
export type ProductImage = { src: string; alt: string; decorative?: boolean; focus?: { x: number; y: number } };

export const products = pgTable(
  "products",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    images: jsonb("images").$type<ProductImage[]>().notNull().default([]),
    /** Opptil tre valg, f.eks. Størrelse og Farge. Tom liste betyr én variant uten valg. */
    options: jsonb("options").$type<ProductOption[]>().notNull().default([]),
    /** MVA-sats i prosent: 25 (standard), 15 (mat), 12, 0. */
    vatRate: integer("vat_rate").notNull().default(25),
    /**
     * Vekt i gram for hele varen, brukt til fraktpris fra Bring. En variant med egen vekt (product_variants.weight_grams)
     * bruker sin egen. Null betyr at vekten mangler: varen kan fortsatt selges, og kassen bruker reserveprisen for Bring.
     */
    weightGrams: integer("weight_grams"),
    status: productStatusEnum("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_site_slug_idx").on(t.siteId, t.slug), index("products_site_status_idx").on(t.siteId, t.status)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    /** Verdier i samme rekkefølge som produktets options, f.eks. ["M", "Blå"]. */
    optionValues: jsonb("option_values").$type<string[]>().notNull().default([]),
    sku: text("sku"),
    priceOre: integer("price_ore").notNull(),
    /** Null betyr at lager ikke følges (tjenester, digitale varer, laget på bestilling). */
    stock: integer("stock"),
    /** Variantens egen vekt i gram. Null betyr at varianten veier det samme som varen (products.weight_grams). */
    weightGrams: integer("weight_grams"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_variants_product_idx").on(t.productId)],
);

/**
 * Hver prisendring lagres. Brukes til å regne ut førpris automatisk:
 * laveste pris de siste 30 dagene før prisen ble satt ned (markedsføringsloven).
 */
export const variantPriceHistory = pgTable(
  "variant_price_history",
  {
    id: id(),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    priceOre: integer("price_ore").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("variant_price_history_idx").on(t.variantId, t.createdAt)],
);

/**
 * Kundene i én butikk, én rad per e-postadresse. Opprettes eller oppdateres ved hvert kjøp,
 * så butikken ser hvem som handler igjen. Kunden logger ikke inn; det er butikkens kundeliste.
 */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Alltid lagret med små bokstaver. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Internt notat for butikken. Vises aldri for kunden. */
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_site_email_idx").on(t.siteId, t.email)],
);

export type ShippingChoice = { code: string; name: string; priceOre: number };
export type ShippingAddress = { name: string; street: string; postalCode: string; city: string; country: string };

export const orders = pgTable(
  "orders",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Fortløpende per nettsted, starter på 1001. */
    number: integer("number").notNull(),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress | null>(),
    shipping: jsonb("shipping").$type<ShippingChoice>().notNull(),
    subtotalOre: integer("subtotal_ore").notNull(),
    shippingOre: integer("shipping_ore").notNull(),
    totalOre: integer("total_ore").notNull(),
    vatOre: integer("vat_ore").notNull(),
    paymentMethod: text("payment_method").notNull(),
    paymentRef: text("payment_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    note: text("note"),
    /** Rabattkoden slik den var ved kjøp, og hvor mye den trakk fra varene. totalOre er etter rabatt. */
    discountCode: text("discount_code"),
    discountOre: integer("discount_ore").notNull().default(0),
    /** Sum av delvise refusjoner (lib/shop/refunds.ts). Hele refusjonen setter status «refundert» i stedet. */
    refundedOre: integer("refunded_ore").notNull().default(0),
    trackingCarrier: text("tracking_carrier"),
    trackingNumber: text("tracking_number"),
    /** Internt notat for butikken. Vises aldri for kunden. */
    staffNote: text("staff_note"),
    /** Hemmelig nøkkel i kvitteringslenken, så kunden kan se ordren uten konto. */
    accessToken: text("access_token").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("orders_site_number_idx").on(t.siteId, t.number),
    index("orders_site_created_idx").on(t.siteId, t.createdAt),
    index("orders_site_status_idx").on(t.siteId, t.status),
    index("orders_customer_idx").on(t.customerId),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    /** Øyeblikksbilde ved kjøp, så ordren ikke endrer seg når varen endres senere. */
    name: text("name").notNull(),
    variantLabel: text("variant_label"),
    sku: text("sku"),
    quantity: integer("quantity").notNull(),
    unitPriceOre: integer("unit_price_ore").notNull(),
    vatRate: integer("vat_rate").notNull(),
    totalOre: integer("total_ore").notNull(),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

export const discountKindEnum = pgEnum("discount_kind", ["percent", "amount", "free_shipping"]);

/** Rabattkoder kunden skriver inn i kassen. Bruk telles atomisk, så en kode med grense ikke kan brukes for mange ganger. */
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Lagres med store bokstaver. Kunden kan skrive koden med små. */
    code: text("code").notNull(),
    kind: discountKindEnum("kind").notNull(),
    /** Prosent (1-100) eller beløp i øre. Brukes ikke for fri frakt. */
    value: integer("value").notNull().default(0),
    minSubtotalOre: integer("min_subtotal_ore"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("discount_codes_site_code_idx").on(t.siteId, t.code)],
);

/**
 * Logg over e-post plattformen har sendt, så butikken ser om kunden fikk ordrebekreftelsen.
 * Selve innholdet lagres ikke, bare hvem, hva og om det gikk.
 */
export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    /** Null for e-post om kontoen (bekreftelse, nytt passord), som ikke hører til et nettsted. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    /** ordrebekreftelse, ny-ordre, sendt eller ny-henvendelse. */
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    /** sendt, feilet, eller logget (e-post er ikke slått på, så den ble bare lagret her). */
    status: text("status").notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_site_idx").on(t.siteId, t.createdAt), index("email_log_order_idx").on(t.orderId)],
);

/**
 * Én kjøring av AI-teamet for ett nettsted: om natten (via Batch API) eller når kunden ber om nye forslag.
 * Kostnaden lagres i øre per kjøring, og summen per måned er det kostnadstaket sjekkes mot (lib/ai/runs.ts).
 */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** natt eller manuell. */
    trigger: text("trigger").notNull(),
    /** venter, ferdig eller feilet. */
    status: text("status").notNull().default("venter"),
    /** Batchen hos Anthropic, for nattkjøringene. */
    batchId: text("batch_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costOre: integer("cost_ore").notNull().default(0),
    suggestionCount: integer("suggestion_count").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ai_runs_site_idx").on(t.siteId, t.createdAt), index("ai_runs_batch_idx").on(t.batchId)],
);

/**
 * Forslag fra AI-teamet. Ingenting endres på nettstedet før kunden trykker Godkjenn, og da bare i kladden.
 * before er verdien da forslaget ble laget. Er kladden endret siden, blir forslaget utdatert i stedet for å overskrive.
 */
export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    /** seo, innhold eller butikk. */
    role: text("role").notNull(),
    /** seo_tittel, seo_beskrivelse, tekst, blogginnlegg, sosialt_innlegg eller tips. */
    kind: text("kind").notNull(),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "cascade" }),
    sectionId: text("section_id"),
    field: text("field"),
    title: text("title").notNull(),
    before: text("before"),
    /** Forslaget: tekst, og for blogginnlegg også ingress, for sosiale medier kanalen. */
    proposal: jsonb("proposal").$type<{ value: string; ingress?: string; channel?: string }>().notNull(),
    reason: text("reason").notNull(),
    effect: text("effect").notNull(),
    /** ny, godkjent, avvist eller utdatert. */
    status: text("status").notNull().default("ny"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_suggestions_site_idx").on(t.siteId, t.status, t.createdAt)],
);

// ---------- Egen timebestilling ----------
// Portet fra Bestilly og utvidet med ansatte. Alt er avgrenset per nettsted. Klokkeslett lagres som minutter etter
// midnatt norsk tid, tidspunkter for bookinger i UTC. Ledige tider regnes ut i lib/egen-booking/availability.ts.

/** Det kunden kan bestille. Varighet og buffer i hele fem minutter, så tidene passer i rutenettet til booking_slots. */
export const bookingServices = pgTable(
  "booking_services",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    durationMinutes: integer("duration_minutes").notNull(),
    /** Pris i øre inkludert MVA. Null betyr at prisen ikke vises. */
    priceOre: integer("price_ore"),
    /** Pause etter timen før neste kan begynne, for eksempel til rydding. */
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("booking_services_site_idx").on(t.siteId, t.sortOrder)],
);

/** Den som utfører timen. En bedrift med én person legger inn seg selv. */
export const bookingStaff = pgTable(
  "booking_staff",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("booking_staff_site_idx").on(t.siteId, t.sortOrder)],
);

/** Hvilke tjenester hver ansatt tar. */
export const bookingStaffServices = pgTable(
  "booking_staff_services",
  {
    staffId: uuid("staff_id").notNull().references(() => bookingStaff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => bookingServices.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] }), index("booking_staff_services_service_idx").on(t.serviceId)],
);

/** Fast ukerytme per ansatt. weekday: 1 er mandag, 7 er søndag (ISO). Minutter etter midnatt norsk tid. */
export const bookingHours = pgTable(
  "booking_hours",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => bookingStaff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [index("booking_hours_staff_idx").on(t.staffId, t.weekday)],
);

export const bookingExceptionKindEnum = pgEnum("booking_exception_kind", ["stengt", "egne_tider", "apen"]);

/**
 * Avvik fra ukerytmen for en periode: ferie og stengt, egne tider, eller «åpent som vanlig» på en helligdag.
 * staffId null betyr hele nettstedet. Norske helligdager er stengt uten at de ligger her.
 */
export const bookingExceptions = pgTable(
  "booking_exceptions",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => bookingStaff.id, { onDelete: "cascade" }),
    kind: bookingExceptionKindEnum("kind").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    /** Bare for egne_tider. */
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("booking_exceptions_site_idx").on(t.siteId, t.endDate)],
);

export const bookingStatusEnum = pgEnum("booking_status", ["bekreftet", "avbestilt"]);

/**
 * En bestilt time. Kunden har ingen konto: navn og kontaktinfo ligger på bookingen.
 * Tjeneste, ansatt og pris lagres også som tekst, så historikken står selv om tjenesten slettes.
 * Bare en hash av avbestillingsnøkkelen lagres. Slettes tolv måneder etter timen (lib/retention.ts).
 */
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => bookingServices.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => bookingStaff.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    staffName: text("staff_name").notNull(),
    priceOre: integer("price_ore"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Slutt pluss buffer. Neste time hos samme ansatt kan tidligst begynne her. */
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    message: text("message").notNull().default(""),
    status: bookingStatusEnum("status").notNull().default("bekreftet"),
    cancelTokenHash: text("cancel_token_hash").notNull().unique(),
    /** kunde eller bedrift. */
    cancelledBy: text("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("bookings_site_starts_idx").on(t.siteId, t.startsAt), index("bookings_staff_starts_idx").on(t.staffId, t.startsAt)],
);

/**
 * Hver bekreftede booking holder av sine fem-minutters ruter hos den ansatte, fra start til slutt pluss buffer.
 * Den unike indeksen på ansatt og tid gjør dobbeltbooking umulig, også når to bestiller samtidig:
 * bookingen og rutene lagres i én SQL-setning, så enten lagres begge, eller ingen (lib/egen-booking/store.ts).
 */
export const bookingSlots = pgTable(
  "booking_slots",
  {
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => bookingStaff.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("booking_slots_staff_time_idx").on(t.staffId, t.startsAt), index("booking_slots_booking_idx").on(t.bookingId)],
);

// ---------- Statistikk ----------

/**
 * Besøk per nettsted og norsk dato. Bare tall, ingen opplysninger om hvem som var innom.
 * Nettleseren sender en liten melding når en side vises (components/site/visit-beacon.tsx, lib/statistikk).
 * Uten informasjonskapsler og uten lagring i nettleseren. Slettes etter STATS_KEEP_MONTHS (lib/retention.ts).
 */
export const visitDays = pgTable(
  "visit_days",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    visitors: integer("visitors").notNull().default(0),
    /** Besøkende på mobil eller nettbrett. Resten er datamaskin. */
    mobileVisitors: integer("mobile_visitors").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day] })],
);

/** Visninger per side og dag. Stien er uten spørring, så ingen nøkler eller e-postadresser havner her. */
export const visitPages = pgTable(
  "visit_pages",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    path: text("path").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.path] })],
);

/** Hvor besøkene kom fra, per dag. Bare vertsnavnet, aldri hele adressen. Tom tekst er direkte besøk. */
export const visitSources = pgTable(
  "visit_sources",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.source] })],
);

/**
 * Skiller besøkende fra hverandre i dag, så samme person ikke telles to ganger. Koden er en hash av IP-adresse og
 * nettleser med et salt som byttes hver dag, så den kan ikke kobles til i går eller til andre nettsteder.
 * Radene slettes hver natt (lib/retention.ts) og tas ikke med i sikkerhetskopien (lib/backup.ts).
 */
export const visitHashes = pgTable(
  "visit_hashes",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    hash: text("hash").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.hash] }), index("visit_hashes_day_idx").on(t.day)],
);

// ---------- Nyhetsbrev ----------

export const newsletterSubscriberStatusEnum = pgEnum("newsletter_subscriber_status", ["venter", "bekreftet", "avmeldt"]);

/**
 * Påmeldte til nyhetsbrevet til et kundenettsted. Dobbel opt-in: raden starter som «venter», og bare «bekreftet»
 * får nyhetsbrev. Den som melder seg av, blir stående som «avmeldt», så adressen aldri får nyhetsbrev igjen ved en feil.
 * Å melde seg på igjen krever ny bekreftelse. Ubekreftede slettes etter 30 dager (lib/retention.ts).
 * E-postadressen lagres med små bokstaver, så samme adresse bare finnes én gang per nettsted.
 */
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    status: newsletterSubscriberStatusEnum("status").notNull().default("venter"),
    /** Setningen den påmeldte så ved knappen, som dokumentasjon på hva det ble sagt ja til. */
    consentText: text("consent_text").notNull(),
    /** Siden påmeldingen kom fra. */
    sourcePath: text("source_path").notNull().default("/"),
    /** Siste påmelding. Bekreftelseslenken gjelder bare påmeldingen med dette tidspunktet. */
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("newsletter_subscribers_site_email_idx").on(t.siteId, t.email), index("newsletter_subscribers_status_idx").on(t.status, t.consentedAt)],
);

export const newsletterStatusEnum = pgEnum("newsletter_status", ["kladd", "sender", "sendt"]);

/** Ett nyhetsbrev. Kladden kan endres. Når det sendes, låses innholdet, og det blir historikk med antall mottakere. */
export const newsletters = pgTable(
  "newsletters",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    /** Blokkene i lib/nyhetsbrev/blocks.ts. */
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    status: newsletterStatusEnum("status").notNull().default("kladd"),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Når «Send» ble trykket. */
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("newsletters_site_idx").on(t.siteId, t.createdAt), index("newsletters_status_idx").on(t.status, t.queuedAt)],
);

/**
 * Én mottaker av ett nyhetsbrev. Opprettes for alle bekreftede når nyhetsbrevet sendes, og sendes i porsjoner av
 * bakgrunnsjobben (lib/nyhetsbrev/send.ts). Adressen hentes fra abonnenten når e-posten sendes, så den som melder seg
 * av underveis, ikke får den. status: venter, sender (tatt av en kjøring), sendt, feilet eller hoppet (meldt av).
 */
export const newsletterDeliveries = pgTable(
  "newsletter_deliveries",
  {
    newsletterId: uuid("newsletter_id").notNull().references(() => newsletters.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").notNull().references(() => newsletterSubscribers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("venter"),
    error: text("error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.newsletterId, t.subscriberId] }), index("newsletter_deliveries_status_idx").on(t.status, t.newsletterId)],
);

// ---------- Rapporter på e-post ----------

/**
 * Hvilke rapporter én bruker vil ha på e-post for ett nettsted. Ingen rad betyr standard: eieren får dem,
 * redaktøren får dem bare hvis hen har slått dem på (lib/rapport/mottakere.ts). Utvikleren får dem ikke.
 */
export const reportPreferences = pgTable(
  "report_preferences",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Månedsrapporten den 1. i måneden. */
    monthlyReport: boolean("monthly_report").notNull(),
    /** E-posten «X nye forslag» etter den ukentlige AI-rapporten. */
    aiEmail: boolean("ai_email").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);

/**
 * Én rad per nettsted og måned som har fått månedsrapporten. Raden lages før e-postene sendes, så to kjøringer
 * samtidig aldri sender samme rapport to ganger. month er «2026-10». status: sender, sendt eller ingen (ingen mottakere).
 */
export const monthlyReports = pgTable(
  "monthly_reports",
  {
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    status: text("status").notNull().default("sender"),
    recipients: integer("recipients").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.month] })],
);

// ---------- Kreditnota ----------

/** Én linje på kreditnotaen, med negative beløp. Kopi av ordrelinjen, så den aldri endrer seg. */
export type CreditNoteLine = {
  name: string;
  variantLabel: string | null;
  sku: string | null;
  quantity: number;
  unitPriceOre: number;
  vatRate: number;
  totalOre: number;
  /** Ordrelinjen kreditnotaen gjelder. Med på delvise kreditnotaer, så resten kan regnes ut ved full refusjon. */
  lineId?: string;
  /** Linjens del av rabatten, negativ. Med på delvise kreditnotaer. */
  discountOre?: number;
};
/** MVA per sats på kreditnotaen, negative beløp. amountOre er inkludert MVA. */
export type CreditNoteVat = { rate: number; amountOre: number; vatOre: number };

/**
 * Kreditnota for en betalt ordre som er kansellert eller refundert (lib/shop/credit-notes.ts). Egen nummerserie per
 * nettsted, fra 1 og uten hull. Beløpene er negative og speiler ordren, også MVA per sats.
 * Bokføringsloven: en kreditnota endres aldri. Databasen stopper endringer med en trigger (migrering 0016), og
 * ordren kan ikke slettes så lenge kreditnotaen finnes. En ordre kan ha flere delvise kreditnotaer (reason
 * «delvis-refundert», én per delrefusjon) og høyst én for resten (kansellert eller refundert).
 */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    /** kansellert eller refundert. */
    reason: text("reason").notNull(),
    lines: jsonb("lines").$type<CreditNoteLine[]>().notNull(),
    vat: jsonb("vat").$type<CreditNoteVat[]>().notNull(),
    subtotalOre: integer("subtotal_ore").notNull(),
    discountOre: integer("discount_ore").notNull(),
    shippingOre: integer("shipping_ore").notNull(),
    totalOre: integer("total_ore").notNull(),
    vatOre: integer("vat_ore").notNull(),
    paymentMethod: text("payment_method").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_notes_site_number_idx").on(t.siteId, t.number),
    index("credit_notes_order_idx").on(t.orderId),
    // Høyst én kreditnota for resten av ordren (kansellert eller refundert). Delvise kan det være flere av.
    uniqueIndex("credit_notes_final_idx").on(t.orderId).where(sql`${t.reason} <> 'delvis-refundert'`),
    index("credit_notes_site_created_idx").on(t.siteId, t.createdAt),
  ],
);

/**
 * Delvis refusjon av en ordre (lib/shop/refunds.ts). Raden lagres som «behandles» før pengene flyttes, og id-en er
 * nøkkelen betalingsløsningen får. Trykker eieren igjen etter en feil, brukes samme rad og samme nøkkel, så kunden
 * aldri får pengene to ganger. Bare én refusjon kan behandles per ordre om gangen (unik delindeks).
 */
export type RefundLine = { lineId: string; quantity: number };

export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    /** behandles, ferdig eller feilet. */
    status: text("status").notNull().default("behandles"),
    lines: jsonb("lines").$type<RefundLine[]>().notNull(),
    shippingOre: integer("shipping_ore").notNull().default(0),
    amountOre: integer("amount_ore").notNull(),
    /** Vises for kunden i e-posten. */
    reason: text("reason"),
    notifyCustomer: boolean("notify_customer").notNull().default(true),
    creditNoteId: uuid("credit_note_id").references(() => creditNotes.id, { onDelete: "restrict" }),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("order_refunds_order_idx").on(t.orderId),
    uniqueIndex("order_refunds_one_pending_idx").on(t.orderId).where(sql`${t.status} = 'behandles'`),
  ],
);
