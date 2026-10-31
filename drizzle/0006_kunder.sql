CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_site_email_idx" ON "customers" USING btree ("site_id","email");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
-- Kunder fra ordre som finnes fra før: én per e-post, med navn og telefon fra siste kjøp.
INSERT INTO "customers" ("site_id", "email", "name", "phone", "created_at")
SELECT "site_id", lower("customer_email"), (array_agg("customer_name" ORDER BY "created_at" DESC))[1], (array_agg("customer_phone" ORDER BY "created_at" DESC))[1], min("created_at")
FROM "orders" GROUP BY "site_id", lower("customer_email");--> statement-breakpoint
UPDATE "orders" SET "customer_id" = c."id" FROM "customers" c WHERE c."site_id" = "orders"."site_id" AND c."email" = lower("orders"."customer_email");
