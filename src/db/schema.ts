import {
  customType,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
export const userRole = pgEnum("user_role", ["admin", "user"]);
export const projectPermission = pgEnum("project_permission", ["read", "write"]);
export const fileKind = pgEnum("file_kind", ["letter", "paraph", "attachment"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ldapId: text("ldap_id").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    role: userRole("role").notNull().default("user"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_lower_idx").on(table.username)],
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

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectPermissions = pgTable(
  "project_permissions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: projectPermission("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_permissions_user_idx").on(table.userId),
  ],
);

export const sheets = pgTable(
  "sheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sheets_project_idx").on(table.projectId),
    uniqueIndex("sheets_project_name_idx").on(table.projectId, table.name),
  ],
);

export const letters = pgTable(
  "letters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    letterDate: text("letter_date").notNull(),
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("letters_sheet_idx").on(table.sheetId),
    index("letters_project_idx").on(table.projectId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    letterId: uuid("letter_id")
      .notNull()
      .references(() => letters.id, { onDelete: "cascade" }),
    kind: fileKind("kind").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("files_letter_kind_idx").on(table.letterId, table.kind),
    index("files_letter_idx").on(table.letterId),
  ],
);

export type AppUser = typeof users.$inferSelect;
export type Permission = typeof projectPermissions.$inferSelect.permission;
