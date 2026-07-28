ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_user_id_fk";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
