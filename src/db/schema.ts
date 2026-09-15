import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  date,
  numeric,
  check,
  type AnyPgColumn,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { APP_ROLES } from "@/lib/roles";
import { AUDIT_ACTIONS } from "@/lib/audit-model";

export const userRole = pgEnum("user_role", APP_ROLES);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    managerUserId: uuid("manager_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "restrict",
    }),
    code: text("code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_active_name_idx")
      .on(sql`lower(trim(${table.name}))`)
      .where(sql`${table.isActive} = true`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ldapId: text("ldap_id").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    role: userRole("role").notNull().default("EMPLOYEE"),
    // Keep the existing SQL column so identity/session upgrades do not rename it.
    isActive: boolean("active").notNull().default(true),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),

    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_idx").on(table.username),
    index("users_department_idx").on(table.departmentId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type AppUser = typeof users.$inferSelect;

export const auditAction = pgEnum("audit_action", AUDIT_ACTIONS);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: auditAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    oldData: jsonb("old_data").$type<Record<string, unknown> | null>(),
    newData: jsonb("new_data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt, t.id),
    index("audit_actor_created_idx").on(t.actorUserId, t.createdAt),
    index("audit_action_created_idx").on(t.action, t.createdAt),
    index("audit_entity_created_idx").on(t.entityType, t.createdAt),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    managerUserId: uuid("manager_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "restrict",
    }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("projects_code_normalized_idx").on(sql`lower(trim(${table.code}))`)],
);

export const reportTypes = pgTable(
  "report_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("report_types_name_idx").on(sql`lower(trim(${t.name}))`)],
);
export const workStatus = pgEnum("work_status", [
  "PENDING_DEPARTMENT_APPROVAL",
  "PENDING_PROJECT_APPROVAL",
  "APPROVED",
  "REJECTED",
]);
export const approvalStage = pgEnum("approval_stage", ["DEPARTMENT", "PROJECT"]);
export const approvalDecision = pgEnum("approval_decision", ["APPROVED", "REJECTED"]);

export const workEntries = pgTable(
  "work_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workDate: date("work_date", { mode: "string" }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reportTypes.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
    status: workStatus("status").notNull().default("PENDING_DEPARTMENT_APPROVAL"),
    description: text("description").notNull(),
    manHours: numeric("man_hours", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("work_entries_employee_date_idx").on(table.employeeId, table.workDate),
    index("work_entries_date_idx").on(table.workDate),
    index("work_entries_project_date_idx").on(table.projectId, table.workDate),
    index("work_entries_report_idx").on(table.reportId),
    index("work_entries_department_status_idx").on(table.departmentId, table.status),
    index("work_entries_project_status_idx").on(table.projectId, table.status),
    check("work_entries_hours_check", sql`${table.manHours} > 0 AND ${table.manHours} <= 24`),
    check(
      "work_entries_description_check",
      sql`length(trim(${table.description})) BETWEEN 0 AND 2000`,
    ),
    check(
      "work_entries_date_check",
      sql`${table.workDate} BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'`,
    ),
  ],
);

export const workEntryApprovals = pgTable(
  "work_entry_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workEntryId: uuid("work_entry_id")
      .notNull()
      .references(() => workEntries.id, { onDelete: "restrict" }),
    stage: approvalStage("stage").notNull(),
    managerUserId: uuid("manager_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: approvalDecision("decision").notNull(),
    rejectionReason: text("rejection_reason"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    actedAt: timestamp("acted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("approvals_manager_date_idx").on(t.managerUserId, t.actedAt, t.id),
    index("approvals_entry_idx").on(t.workEntryId),
    check(
      "approval_reason_check",
      sql`(${t.decision} = 'APPROVED' AND ${t.rejectionReason} IS NULL) OR (${t.decision} = 'REJECTED' AND ${t.rejectionReason} IS NOT NULL AND length(trim(${t.rejectionReason})) BETWEEN 1 AND 1000)`,
    ),
  ],
);
