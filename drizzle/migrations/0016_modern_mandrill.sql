CREATE TYPE "public"."social_brand" AS ENUM('pkp', 'trihuni');--> statement-breakpoint
CREATE TYPE "public"."social_comment_class" AS ENUM('pertanyaan', 'lead', 'pujian', 'kritik', 'spam', 'internal', 'lain');--> statement-breakpoint
CREATE TYPE "public"."social_comment_mode" AS ENUM('balas', 'sapa');--> statement-breakpoint
CREATE TYPE "public"."social_comment_status" AS ENUM('drafted', 'approved', 'posted', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('idea', 'drafted', 'in_review', 'revision', 'approved', 'scheduled', 'published', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."social_sync_status" AS ENUM('ok', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "social_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" "social_brand" NOT NULL,
	"external_id" text NOT NULL,
	"mode" "social_comment_mode" NOT NULL,
	"class" "social_comment_class" NOT NULL,
	"status" "social_comment_status" NOT NULL,
	"target_owner" text,
	"post_id" text,
	"permalink" text,
	"source_author" text,
	"source_text" text,
	"draft" text NOT NULL,
	"reason" text,
	"comment_created_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" "social_brand" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"pillar" text,
	"status" "social_post_status" DEFAULT 'drafted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"permalink" text,
	"caption" text,
	"slide_count" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" "social_brand" NOT NULL,
	"handle" text NOT NULL,
	"source" text,
	"status" "social_sync_status" DEFAULT 'ok' NOT NULL,
	"posts_upserted" integer DEFAULT 0 NOT NULL,
	"comments_upserted" integer DEFAULT 0 NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_comment_brand_external_id_key" ON "social_comment" USING btree ("brand","external_id");--> statement-breakpoint
CREATE INDEX "social_comment_status_idx" ON "social_comment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_comment_posted_at_idx" ON "social_comment" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "social_comment_target_owner_idx" ON "social_comment" USING btree ("target_owner");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_brand_external_id_key" ON "social_post" USING btree ("brand","external_id");--> statement-breakpoint
CREATE INDEX "social_post_status_idx" ON "social_post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_post_posted_at_idx" ON "social_post" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "social_sync_run_brand_started_at_idx" ON "social_sync_run" USING btree ("brand","started_at");