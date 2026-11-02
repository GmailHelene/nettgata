CREATE TABLE "inquiry_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"inquiry_id" uuid,
	"upload_id" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_images_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "inquiry_images" ADD CONSTRAINT "inquiry_images_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_images" ADD CONSTRAINT "inquiry_images_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_images_inquiry_idx" ON "inquiry_images" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "inquiry_images_upload_idx" ON "inquiry_images" USING btree ("site_id","upload_id");--> statement-breakpoint
CREATE INDEX "inquiry_images_created_idx" ON "inquiry_images" USING btree ("created_at");