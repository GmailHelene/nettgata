import { sql } from "drizzle-orm";
import {
  boolean,
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

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["owner", "editor", "developer"]);
export const siteKindEnum = pgEnum("site_kind", ["nettside", "nettbutikk"]);
export const domainStatusEnum = pgEnum("domain_status", ["pending", "active"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
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
  createdAt: createdAt(),
});

export const domains = pgTable(
  "domains",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Alltid lagret med små bokstaver og uten port. */
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: domainStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("domains_site_idx").on(t.siteId)],
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
    pagePath: text("page_path"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("inquiries_site_idx").on(t.siteId, t.createdAt)],
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
