ALTER TABLE "trips" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;