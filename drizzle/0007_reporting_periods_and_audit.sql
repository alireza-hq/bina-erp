CREATE TYPE "public"."audit_action" AS ENUM('PERIOD_LOCKED', 'PERIOD_UNLOCKED', 'WORK_ENTRY_CREATED', 'WORK_ENTRY_UPDATED', 'WORK_ENTRY_DELETED', 'USER_ROLE_CHANGED', 'USER_DEPARTMENT_CHANGED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_UPDATED', 'DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED', 'DEPARTMENT_ACTIVATED', 'DEPARTMENT_DEACTIVATED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ACTIVATED', 'PROJECT_DEACTIVATED', 'PROJECT_FILE_CREATED', 'PROJECT_FILE_UPDATED', 'PROJECT_FILE_ACTIVATED', 'PROJECT_FILE_DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."reporting_period_status" AS ENUM('OPEN', 'LOCKED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"status" "reporting_period_status" DEFAULT 'OPEN' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_periods_week_start_unique" UNIQUE("week_start"),
	CONSTRAINT "reporting_period_week_check" CHECK (extract(dow from "reporting_periods"."week_start") = 6 AND "reporting_periods"."week_end" = "reporting_periods"."week_start" + 6 AND "reporting_periods"."week_start" >= DATE '2000-01-01' AND "reporting_periods"."week_start" <= DATE '2099-12-31'),
	CONSTRAINT "reporting_period_lock_check" CHECK (("reporting_periods"."status" = 'OPEN' AND "reporting_periods"."locked_at" IS NULL AND "reporting_periods"."locked_by" IS NULL) OR ("reporting_periods"."status" = 'LOCKED' AND "reporting_periods"."locked_at" IS NOT NULL AND "reporting_periods"."locked_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_periods" ADD CONSTRAINT "reporting_periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "audit_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_created_idx" ON "audit_logs" USING btree ("entity_type","created_at");