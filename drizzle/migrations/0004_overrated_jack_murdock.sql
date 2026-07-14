CREATE TYPE "public"."project_phase_status" AS ENUM('belum', 'berjalan', 'selesai');--> statement-breakpoint
CREATE TABLE "project_phase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer NOT NULL,
	"status" "project_phase_status" DEFAULT 'belum' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"assigned_surveyor_id" text,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_phase" ADD CONSTRAINT "project_phase_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase" ADD CONSTRAINT "project_phase_assigned_surveyor_id_user_id_fk" FOREIGN KEY ("assigned_surveyor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_phase_project_id_idx" ON "project_phase" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_phase_assigned_surveyor_id_idx" ON "project_phase" USING btree ("assigned_surveyor_id");