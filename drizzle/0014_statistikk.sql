CREATE TABLE "visit_days" (
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"mobile_visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visit_days_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "visit_hashes" (
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"hash" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visit_hashes_site_id_day_hash_pk" PRIMARY KEY("site_id","day","hash")
);
--> statement-breakpoint
CREATE TABLE "visit_pages" (
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visit_pages_site_id_day_path_pk" PRIMARY KEY("site_id","day","path")
);
--> statement-breakpoint
CREATE TABLE "visit_sources" (
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "visit_sources_site_id_day_source_pk" PRIMARY KEY("site_id","day","source")
);
--> statement-breakpoint
ALTER TABLE "visit_days" ADD CONSTRAINT "visit_days_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_hashes" ADD CONSTRAINT "visit_hashes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_pages" ADD CONSTRAINT "visit_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_sources" ADD CONSTRAINT "visit_sources_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_hashes_day_idx" ON "visit_hashes" USING btree ("day");