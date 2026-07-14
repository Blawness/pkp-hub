CREATE SEQUENCE IF NOT EXISTS "receipt_number_seq" AS bigint START WITH 1 INCREMENT BY 1;--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('transfer', 'tunai', 'lainnya');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" text,
	"receipt_number" text NOT NULL,
	"receipt_file_url" text,
	"recorded_by_id" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"voided_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_voided_by_id_user_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_project_id_idx" ON "payment" USING btree ("project_id");