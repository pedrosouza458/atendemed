CREATE TYPE "public"."referral_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"source_facility_id" uuid NOT NULL,
	"target_facility_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"urgency" varchar(20) NOT NULL,
	"message" text,
	"patient_snapshot" jsonb NOT NULL,
	"encounter_snapshot" jsonb NOT NULL,
	"status" "referral_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_source_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("source_facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_target_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("target_facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_incoming_idx" ON "referrals" USING btree ("target_facility_id","status","created_at");--> statement-breakpoint
CREATE INDEX "referrals_patient_idx" ON "referrals" USING btree ("patient_id","created_at");