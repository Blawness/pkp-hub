CREATE TABLE "equipment_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "equipment_category" NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_item_id_equipment_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."equipment_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_item_id_idx" ON "equipment" USING btree ("item_id");