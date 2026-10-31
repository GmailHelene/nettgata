CREATE TYPE "public"."domain_kind" AS ENUM('apex', 'www', 'sub');--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "kind" "domain_kind" DEFAULT 'sub' NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "cf_hostname_id" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "failing_since" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "domains_status_checked_idx" ON "domains" USING btree ("status","checked_at");