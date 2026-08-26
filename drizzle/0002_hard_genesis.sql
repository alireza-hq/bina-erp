INSERT INTO "users" ("ldap_id", "username", "display_name", "role", "active", "updated_at")
VALUES ('pending:a.haghighi', 'a.haghighi', 'a.haghighi', 'admin', true, now())
ON CONFLICT ("username") DO UPDATE
SET "role" = 'admin', "active" = true, "password_hash" = NULL, "updated_at" = now();--> statement-breakpoint
UPDATE "letters"
SET "created_by" = (SELECT "id" FROM "users" WHERE "username" = 'a.haghighi')
WHERE "created_by" IN (
  SELECT "id" FROM "users" WHERE "ldap_id" = 'local:bootstrap-super-admin'
);--> statement-breakpoint
DELETE FROM "users" WHERE "ldap_id" = 'local:bootstrap-super-admin';--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "role" = 'super_admin';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";
