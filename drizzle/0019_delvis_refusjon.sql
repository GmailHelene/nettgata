CREATE TABLE "order_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'behandles' NOT NULL,
	"lines" jsonb NOT NULL,
	"shipping_ore" integer DEFAULT 0 NOT NULL,
	"amount_ore" integer NOT NULL,
	"reason" text,
	"notify_customer" boolean DEFAULT true NOT NULL,
	"credit_note_id" uuid,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "credit_notes_order_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_ore" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_refunds_one_pending_idx" ON "order_refunds" USING btree ("order_id") WHERE "order_refunds"."status" = 'behandles';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_final_idx" ON "credit_notes" USING btree ("order_id") WHERE "credit_notes"."reason" <> 'delvis-refundert';--> statement-breakpoint
CREATE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("order_id");