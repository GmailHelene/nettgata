CREATE TYPE "public"."newsletter_status" AS ENUM('kladd', 'sender', 'sendt');--> statement-breakpoint
CREATE TYPE "public"."newsletter_subscriber_status" AS ENUM('venter', 'bekreftet', 'avmeldt');--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"newsletter_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"status" text DEFAULT 'venter' NOT NULL,
	"error" text,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	CONSTRAINT "newsletter_deliveries_newsletter_id_subscriber_id_pk" PRIMARY KEY("newsletter_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" "newsletter_subscriber_status" DEFAULT 'venter' NOT NULL,
	"consent_text" text NOT NULL,
	"source_path" text DEFAULT '/' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "newsletter_status" DEFAULT 'kladd' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_deliveries_status_idx" ON "newsletter_deliveries" USING btree ("status","newsletter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_site_email_idx" ON "newsletter_subscribers" USING btree ("site_id","email");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers" USING btree ("status","consented_at");--> statement-breakpoint
CREATE INDEX "newsletters_site_idx" ON "newsletters" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "newsletters_status_idx" ON "newsletters" USING btree ("status","queued_at");