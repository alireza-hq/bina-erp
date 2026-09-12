-- Retire the old domain without deleting data. Users and sessions remain in public.
-- Back up first; external consumers of public legacy tables must be retired before applying.
CREATE SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TABLE "public"."files" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TABLE "public"."letters" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TABLE "public"."project_permissions" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TABLE "public"."sheets" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TABLE "public"."projects" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TYPE "public"."file_kind" SET SCHEMA "legacy_letter_list";
--> statement-breakpoint
ALTER TYPE "public"."project_permission" SET SCHEMA "legacy_letter_list";
