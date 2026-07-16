ALTER TABLE "equipment" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
UPDATE "equipment" SET "category" = 'instrumen_ukur' WHERE "category" IN ('total_station', 'waterpass', 'theodolite');--> statement-breakpoint
DROP TYPE "public"."equipment_category";--> statement-breakpoint
CREATE TYPE "public"."equipment_category" AS ENUM('instrumen_ukur', 'gps_rtk', 'drone', 'aksesoris_survey', 'inventaris_kantor', 'lainnya');--> statement-breakpoint
ALTER TABLE "equipment" ALTER COLUMN "category" SET DATA TYPE "public"."equipment_category" USING "category"::"public"."equipment_category";