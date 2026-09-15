CREATE SCHEMA "workflow_archive";
--> statement-breakpoint
CREATE TABLE "workflow_archive"."user_retired_fields" AS SELECT id, email, employee_code FROM "public"."users";
--> statement-breakpoint
CREATE TABLE "workflow_archive"."work_entry_project_files" AS SELECT id, project_file_id FROM "public"."work_entries";
--> statement-breakpoint
ALTER TABLE "public"."work_entries" DROP CONSTRAINT "work_entries_project_file_project_fk";
--> statement-breakpoint
ALTER TABLE "public"."work_entries" DROP COLUMN "project_file_id";
--> statement-breakpoint
ALTER TABLE "public"."project_files" SET SCHEMA "workflow_archive";
--> statement-breakpoint
ALTER TABLE "public"."reporting_periods" SET SCHEMA "workflow_archive";
--> statement-breakpoint
ALTER TYPE "public"."reporting_period_status" SET SCHEMA "workflow_archive";
--> statement-breakpoint
ALTER TABLE "public"."users" DROP COLUMN "email", DROP COLUMN "employee_code";
--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('PENDING_DEPARTMENT_APPROVAL', 'PENDING_PROJECT_APPROVAL', 'APPROVED', 'REJECTED');
--> statement-breakpoint
CREATE TYPE "public"."approval_stage" AS ENUM('DEPARTMENT', 'PROJECT');
--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('APPROVED', 'REJECTED');
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'WORK_ENTRY_SUBMITTED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'WORK_ENTRY_RESUBMITTED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'DEPARTMENT_APPROVED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'DEPARTMENT_REJECTED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_APPROVED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_REJECTED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'DEPARTMENT_MANAGER_CHANGED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_MANAGER_CHANGED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'REPORT_CREATED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'REPORT_UPDATED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'REPORT_ACTIVATED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'REPORT_DEACTIVATED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROFILE_COMPLETED' BEFORE 'PERIOD_LOCKED';
--> statement-breakpoint
CREATE TABLE "report_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "work_entry_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_entry_id" uuid NOT NULL,
	"stage" "approval_stage" NOT NULL,
	"manager_user_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"rejection_reason" text,
	"snapshot" jsonb NOT NULL,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_reason_check" CHECK (("work_entry_approvals"."decision" = 'APPROVED' AND "work_entry_approvals"."rejection_reason" IS NULL) OR ("work_entry_approvals"."decision" = 'REJECTED' AND "work_entry_approvals"."rejection_reason" IS NOT NULL AND length(trim("work_entry_approvals"."rejection_reason")) BETWEEN 1 AND 1000))
);

--> statement-breakpoint
ALTER TABLE "work_entries" DROP CONSTRAINT "work_entries_description_check";
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "manager_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "manager_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "report_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "department_id" uuid;
--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "status" "work_status" DEFAULT 'PENDING_DEPARTMENT_APPROVAL' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_entry_approvals" ADD CONSTRAINT "work_entry_approvals_work_entry_id_work_entries_id_fk" FOREIGN KEY ("work_entry_id") REFERENCES "public"."work_entries"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_entry_approvals" ADD CONSTRAINT "work_entry_approvals_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "report_types_name_idx" ON "report_types" USING btree (lower(trim("name")));
--> statement-breakpoint
CREATE INDEX "approvals_manager_date_idx" ON "work_entry_approvals" USING btree ("manager_user_id","acted_at","id");
--> statement-breakpoint
CREATE INDEX "approvals_entry_idx" ON "work_entry_approvals" USING btree ("work_entry_id");
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_report_id_report_types_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report_types"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "work_entries_report_idx" ON "work_entries" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX "work_entries_department_status_idx" ON "work_entries" USING btree ("department_id","status");
--> statement-breakpoint
CREATE INDEX "work_entries_project_status_idx" ON "work_entries" USING btree ("project_id","status");
--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_description_check" CHECK (length(trim("work_entries"."description")) BETWEEN 0 AND 2000);
--> statement-breakpoint
INSERT INTO "public"."report_types" (id,name,description,is_active) SELECT '00000000-0000-4000-8000-000000000008','گزارش قدیمی','Imported work entries predating the approval workflow; no manager approvals were fabricated.',false WHERE EXISTS (SELECT 1 FROM "public"."work_entries");
--> statement-breakpoint
UPDATE "public"."work_entries" w SET report_id='00000000-0000-4000-8000-000000000008',status='APPROVED',department_id=u.department_id FROM "public"."users" u WHERE u.id=w.employee_id;
--> statement-breakpoint
ALTER TABLE "public"."work_entries" ALTER COLUMN "report_id" SET NOT NULL;
