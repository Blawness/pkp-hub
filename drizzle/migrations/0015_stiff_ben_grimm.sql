CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"read_by_client" boolean DEFAULT false NOT NULL,
	"read_by_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_project_id_idx" ON "comment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "comment_author_id_idx" ON "comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comment_created_at_idx" ON "comment" USING btree ("created_at");