-- The referenced unique index must exist before adding the composite foreign key.
CREATE UNIQUE INDEX "project_files_id_project_idx" ON "project_files" USING btree ("id","project_id");
--> statement-breakpoint
CREATE TABLE "work_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"project_id" uuid NOT NULL,
	"project_file_id" uuid NOT NULL,
	"description" text NOT NULL,
	"man_hours" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_entries_hours_check" CHECK ("work_entries"."man_hours" > 0 AND "work_entries"."man_hours" <= 24),
	CONSTRAINT "work_entries_description_check" CHECK (length(trim("work_entries"."description")) BETWEEN 1 AND 2000),
	CONSTRAINT "work_entries_date_check" CHECK ("work_entries"."work_date" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31')
);
--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_project_file_project_fk" FOREIGN KEY ("project_file_id","project_id") REFERENCES "public"."project_files"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_entries_employee_date_idx" ON "work_entries" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "work_entries_project_date_idx" ON "work_entries" USING btree ("project_id","work_date");--> statement-breakpoint
CREATE INDEX "work_entries_project_file_idx" ON "work_entries" USING btree ("project_file_id");--> statement-breakpoint
