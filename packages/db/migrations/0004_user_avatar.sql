ALTER TABLE "users" ADD COLUMN "avatar" "bytea";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_version" integer;