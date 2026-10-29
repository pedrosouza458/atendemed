ALTER TYPE "public"."facility_type" ADD VALUE 'UPA' BEFORE 'CLINIC';--> statement-breakpoint
CREATE TABLE "facility_arrivals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"arrival_date" date NOT NULL,
	"code" varchar(8) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "healthcare_facilities" ADD COLUMN "occupancy_capacity" integer;--> statement-breakpoint
ALTER TABLE "facility_arrivals" ADD CONSTRAINT "facility_arrivals_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_arrivals" ADD CONSTRAINT "facility_arrivals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facility_arrivals_code_uq" ON "facility_arrivals" USING btree ("facility_id","arrival_date","code");--> statement-breakpoint
CREATE INDEX "facility_arrivals_active_idx" ON "facility_arrivals" USING btree ("facility_id","closed_at");