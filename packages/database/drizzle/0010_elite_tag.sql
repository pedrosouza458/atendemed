CREATE TABLE "patient_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"object_key" varchar(512) NOT NULL,
	"file_name" varchar(180) NOT NULL,
	"mime_type" varchar(40) NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_reports_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "patient_reports" ADD CONSTRAINT "patient_reports_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_reports_patient_idx" ON "patient_reports" USING btree ("patient_id","created_at");
UPDATE "healthcare_facilities" SET "latitude" = -23.5505, "longitude" = -46.6333 WHERE "id" = '00000000-0000-4000-8000-000000000101';
UPDATE "healthcare_facilities" SET "latitude" = -23.5578, "longitude" = -46.6488 WHERE "id" = '00000000-0000-4000-8000-000000000102';
UPDATE "healthcare_facilities" SET "latitude" = -23.5433, "longitude" = -46.6389 WHERE "id" = '00000000-0000-4000-8000-000000000107';
