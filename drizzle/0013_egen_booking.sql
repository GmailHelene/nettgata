CREATE TYPE "public"."booking_exception_kind" AS ENUM('stengt', 'egne_tider', 'apen');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('bekreftet', 'avbestilt');--> statement-breakpoint
CREATE TABLE "booking_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"staff_id" uuid,
	"kind" "booking_exception_kind" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_ore" integer,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"booking_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_staff_services" (
	"staff_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "booking_staff_services_staff_id_service_id_pk" PRIMARY KEY("staff_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"service_id" uuid,
	"staff_id" uuid,
	"service_name" text NOT NULL,
	"staff_name" text NOT NULL,
	"price_ore" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "booking_status" DEFAULT 'bekreftet' NOT NULL,
	"cancel_token_hash" text NOT NULL,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_cancel_token_hash_unique" UNIQUE("cancel_token_hash")
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "booking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_exceptions" ADD CONSTRAINT "booking_exceptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_exceptions" ADD CONSTRAINT "booking_exceptions_staff_id_booking_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."booking_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hours" ADD CONSTRAINT "booking_hours_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hours" ADD CONSTRAINT "booking_hours_staff_id_booking_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."booking_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_staff_id_booking_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."booking_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff" ADD CONSTRAINT "booking_staff_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_services" ADD CONSTRAINT "booking_staff_services_staff_id_booking_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."booking_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_services" ADD CONSTRAINT "booking_staff_services_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_booking_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."booking_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_exceptions_site_idx" ON "booking_exceptions" USING btree ("site_id","end_date");--> statement-breakpoint
CREATE INDEX "booking_hours_staff_idx" ON "booking_hours" USING btree ("staff_id","weekday");--> statement-breakpoint
CREATE INDEX "booking_services_site_idx" ON "booking_services" USING btree ("site_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_slots_staff_time_idx" ON "booking_slots" USING btree ("staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_slots_booking_idx" ON "booking_slots" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_staff_site_idx" ON "booking_staff" USING btree ("site_id","sort_order");--> statement-breakpoint
CREATE INDEX "booking_staff_services_service_idx" ON "booking_staff_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "bookings_site_starts_idx" ON "bookings" USING btree ("site_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_staff_starts_idx" ON "bookings" USING btree ("staff_id","starts_at");--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;