ALTER TABLE "users" ADD COLUMN "supporter_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supporter_lifetime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code");