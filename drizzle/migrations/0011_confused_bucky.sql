ALTER TABLE "equipment" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_code_uniq" ON "equipment" USING btree ("code");--> statement-breakpoint
ALTER TABLE "equipment" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "equipment" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "equipment" DROP COLUMN "image";