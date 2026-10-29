CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"facility_id" uuid,
	"type" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"message" text NOT NULL,
	"resource_type" varchar(80),
	"resource_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facility_arrivals" ADD COLUMN "patient_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_facility_id_healthcare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."healthcare_facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_resource_idx" ON "notifications" USING btree ("resource_type","resource_id");--> statement-breakpoint
ALTER TABLE "facility_arrivals" ADD CONSTRAINT "facility_arrivals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_arrivals_patient_idx" ON "facility_arrivals" USING btree ("patient_id");