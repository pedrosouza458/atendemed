ALTER TYPE "public"."referral_status" ADD VALUE 'ASSIGNED' BEFORE 'ACCEPTED';--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "target_doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_target_doctor_id_users_id_fk" FOREIGN KEY ("target_doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;