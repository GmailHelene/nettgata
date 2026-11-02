CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"reason" text NOT NULL,
	"lines" jsonb NOT NULL,
	"vat" jsonb NOT NULL,
	"subtotal_ore" integer NOT NULL,
	"discount_ore" integer NOT NULL,
	"shipping_ore" integer NOT NULL,
	"total_ore" integer NOT NULL,
	"vat_ore" integer NOT NULL,
	"payment_method" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"site_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'sender' NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "monthly_reports_site_id_month_pk" PRIMARY KEY("site_id","month")
);
--> statement-breakpoint
CREATE TABLE "report_preferences" (
	"site_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"monthly_report" boolean NOT NULL,
	"ai_email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_preferences_site_id_user_id_pk" PRIMARY KEY("site_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_preferences" ADD CONSTRAINT "report_preferences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_preferences" ADD CONSTRAINT "report_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_site_number_idx" ON "credit_notes" USING btree ("site_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "credit_notes_site_created_idx" ON "credit_notes" USING btree ("site_id","created_at");--> statement-breakpoint
-- Bokføringsloven: en kreditnota endres aldri etter at den er laget. Sletting skjer bare når hele nettstedet slettes.
CREATE FUNCTION "credit_notes_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'En kreditnota kan ikke endres';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "credit_notes_no_update" BEFORE UPDATE ON "credit_notes" FOR EACH ROW EXECUTE FUNCTION "credit_notes_immutable"();
