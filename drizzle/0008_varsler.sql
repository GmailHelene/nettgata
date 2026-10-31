CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"order_id" uuid,
	"inquiry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "notifications" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_site_idx" ON "email_log" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "email_log_order_idx" ON "email_log" USING btree ("order_id");