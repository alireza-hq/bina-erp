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
  foreignKey,
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
    email: text("email"),
    role: userRole("role").notNull().default("EMPLOYEE"),
    // Keep the existing SQL column so identity/session upgrades do not rename it.
    isActive: boolean("active").notNull().default(true),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
    employeeCode: text("employee_code"),
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

export const periodStatus = pgEnum("reporting_period_status", ["OPEN", "LOCKED"]);
export const reportingPeriods = pgTable(
  "reporting_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weekStart: date("week_start", { mode: "string" }).notNull().unique(),
    weekEnd: date("week_end", { mode: "string" }).notNull(),
    status: periodStatus("status").notNull().default("OPEN"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: uuid("locked_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "reporting_period_week_check",
      sql`extract(dow from ${t.weekStart}) = 6 AND ${t.weekEnd} = ${t.weekStart} + 6 AND ${t.weekStart} >= DATE '2000-01-01' AND ${t.weekStart} <= DATE '2099-12-31'`,
    ),
    check(
      "reporting_period_lock_check",
      sql`(${t.status} = 'OPEN' AND ${t.lockedAt} IS NULL AND ${t.lockedBy} IS NULL) OR (${t.status} = 'LOCKED' AND ${t.lockedAt} IS NOT NULL AND ${t.lockedBy} IS NOT NULL)`,
    ),
  ],
);
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
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("projects_code_normalized_idx").on(sql`lower(trim(${table.code}))`)],
);

// Predefined dropdown values; these are not uploaded files.
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_files_project_code_idx").on(
      table.projectId,
      sql`lower(trim(${table.code}))`,
    ),
    index("project_files_project_active_idx").on(table.projectId, table.isActive),
    uniqueIndex("project_files_id_project_idx").on(table.id, table.projectId),
  ],
);

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
    projectFileId: uuid("project_file_id").notNull(),
    description: text("description").notNull(),
    manHours: numeric("man_hours", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("work_entries_employee_date_idx").on(table.employeeId, table.workDate),
    index("work_entries_date_idx").on(table.workDate),
    index("work_entries_project_date_idx").on(table.projectId, table.workDate),
    index("work_entries_project_file_idx").on(table.projectFileId),
    foreignKey({
      name: "work_entries_project_file_project_fk",
      columns: [table.projectFileId, table.projectId],
      foreignColumns: [projectFiles.id, projectFiles.projectId],
    }).onDelete("restrict"),
    check("work_entries_hours_check", sql`${table.manHours} > 0 AND ${table.manHours} <= 24`),
    check(
      "work_entries_description_check",
      sql`length(trim(${table.description})) BETWEEN 1 AND 2000`,
    ),
    check(
      "work_entries_date_check",
      sql`${table.workDate} BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'`,
    ),
  ],
);
