CREATE TYPE "public"."equipment_category" AS ENUM('total_station', 'gps_rtk', 'drone', 'waterpass', 'theodolite', 'lainnya');--> statement-breakpoint
CREATE TYPE "public"."equipment_condition" AS ENUM('tersedia', 'perawatan', 'rusak', 'pensiun');--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "equipment_category" NOT NULL,
	"serial_number" text,
	"condition" "equipment_condition" DEFAULT 'tersedia' NOT NULL,
	"purchase_date" date,
	"purchase_price" bigint,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"used_by_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text,
	"recorded_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment_usage" ADD CONSTRAINT "equipment_usage_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_usage" ADD CONSTRAINT "equipment_usage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_usage" ADD CONSTRAINT "equipment_usage_used_by_id_user_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_usage" ADD CONSTRAINT "equipment_usage_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_condition_idx" ON "equipment" USING btree ("condition");--> statement-breakpoint
CREATE INDEX "equipment_archived_at_idx" ON "equipment" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "equipment_usage_equipment_id_idx" ON "equipment_usage" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "equipment_usage_project_id_idx" ON "equipment_usage" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_active_usage_uniq" ON "equipment_usage" USING btree ("equipment_id") WHERE "equipment_usage"."ended_at" is null;