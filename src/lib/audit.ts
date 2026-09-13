import type { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { AuditAction, AuditEntity } from "@/lib/audit-model";
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function recordAudit(
  tx: Transaction,
  actorUserId: string | null,
  action: AuditAction,
  entityType: AuditEntity,
  entityId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
) {
  await tx
    .insert(auditLogs)
    .values({ actorUserId, action, entityType, entityId, oldData, newData });
}
// Explicit projections prevent credentials/directory/session data entering the trail.
const fields = {
  USER: ["username", "displayName", "role", "departmentId", "isActive", "employeeCode"],
  DEPARTMENT: ["name", "code", "isActive"],
  PROJECT: ["name", "code", "description", "isActive"],
  PROJECT_FILE: ["projectId", "name", "code", "description", "isActive"],
  WORK_ENTRY: ["employeeId", "workDate", "projectId", "projectFileId", "description", "manHours"],
  PERIOD: ["weekStart", "weekEnd", "status", "lockedAt", "lockedBy"],
} as const;
export function auditData(entity: AuditEntity, row: object) {
  const source = row as Record<string, unknown>;
  return Object.fromEntries(
    fields[entity].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}
export async function auditMasterChange(
  tx: Transaction,
  actorId: string,
  entity: "USER" | "DEPARTMENT" | "PROJECT" | "PROJECT_FILE",
  id: string,
  before: object | null,
  after: object,
) {
  const oldData = before ? auditData(entity, before) : null,
    newData = auditData(entity, after);
  if (!oldData) {
    await recordAudit(tx, actorId, `${entity}_CREATED` as AuditAction, entity, id, null, newData);
    return;
  }
  const changed = Object.keys(newData).filter(
    (key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]),
  );
  if (!changed.length) return;
  const actions: AuditAction[] = [];
  if (changed.includes("isActive"))
    actions.push(`${entity}_${newData.isActive ? "ACTIVATED" : "DEACTIVATED"}` as AuditAction);
  if (entity === "USER") {
    if (changed.includes("role")) actions.push("USER_ROLE_CHANGED");
    if (changed.includes("departmentId")) actions.push("USER_DEPARTMENT_CHANGED");
    if (changed.includes("employeeCode")) actions.push("USER_UPDATED");
  } else if (changed.some((key) => key !== "isActive"))
    actions.push(`${entity}_UPDATED` as AuditAction);
  for (const action of actions)
    await recordAudit(tx, actorId, action, entity, id, oldData, newData);
}
