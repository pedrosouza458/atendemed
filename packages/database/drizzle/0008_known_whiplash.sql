ALTER TABLE "attendances" ALTER COLUMN "queue_ticket_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "target_attendance_id" uuid;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_target_attendance_id_attendances_id_fk" FOREIGN KEY ("target_attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_target_attendance_id_unique" UNIQUE("target_attendance_id");