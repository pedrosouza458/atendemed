CREATE TYPE "public"."attendance_status" AS ENUM('IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_ticket_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendances_queue_ticket_id_unique" UNIQUE("queue_ticket_id")
);
--> statement-breakpoint
CREATE TABLE "medical_record_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"evolution" text NOT NULL,
	"diagnosis" text,
	"conduct" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"department" varchar(80) NOT NULL,
	"ticket_date" date NOT NULL,
	"code" varchar(12) NOT NULL,
	"status" "queue_status" DEFAULT 'WAITING' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"priority_reason" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"vitals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"priority_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "triage_records_attendance_id_unique" UNIQUE("attendance_id")
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_queue_ticket_id_queue_tickets_id_fk" FOREIGN KEY ("queue_ticket_id") REFERENCES "public"."queue_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entries" ADD CONSTRAINT "medical_record_entries_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entries" ADD CONSTRAINT "medical_record_entries_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entries" ADD CONSTRAINT "medical_record_entries_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_record_entries" ADD CONSTRAINT "medical_record_entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_records_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_records_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendances_patient_idx" ON "attendances" USING btree ("patient_id","started_at");--> statement-breakpoint
CREATE INDEX "medical_record_patient_idx" ON "medical_record_entries" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_tickets_code_uq" ON "queue_tickets" USING btree ("facility_id","ticket_date","department","code");--> statement-breakpoint
CREATE INDEX "queue_tickets_queue_idx" ON "queue_tickets" USING btree ("facility_id","department","status","priority","issued_at");