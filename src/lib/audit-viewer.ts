import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs as a, users as u } from "@/db/schema";
import { auditQuerySchema, type AuditQuery } from "@/lib/audit-query";
import type { AuditAction } from "@/lib/audit-model";
export async function getAuditLogs(input: AuditQuery) {
  const q = auditQuerySchema.parse(input);
  const parts = [
    sql`${a.createdAt} >= (${q.from}::date::timestamp AT TIME ZONE 'Asia/Tehran')`,
    sql`${a.createdAt} < ((${q.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Tehran')`,
  ];
  if (q.actor)
    parts.push(
      sql`strpos(lower(coalesce(${u.displayName},'system') || ' ' || coalesce(${u.username},'')),lower(${q.actor})) > 0`,
    );
  if (q.action) parts.push(sql`${a.action} = ${q.action}`);
  if (q.entityType) parts.push(sql`${a.entityType} = ${q.entityType}`);
  const source = sql`${a} LEFT JOIN ${u} ON ${a.actorUserId} = ${u.id}`,
    where = sql.join(parts, sql` AND `);
  return db.transaction(
    async (tx) => {
      const [total] = await tx.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM ${source} WHERE ${where}`,
      );
      const rows = await tx.execute<{
        id: string;
        actor: string;
        action: AuditAction;
        entityType: string;
        entityId: string;
        createdAt: string;
        oldData: Record<string, unknown> | null;
        newData: Record<string, unknown> | null;
      }>(
        sql`SELECT ${a.id} AS id, coalesce(${u.displayName} || ' / ' || ${u.username},'سامانه / ابزار مدیریتی') AS actor, ${a.action} AS action, ${a.entityType} AS "entityType", ${a.entityId} AS "entityId", ${a.createdAt}::text AS "createdAt", ${a.oldData} AS "oldData", ${a.newData} AS "newData" FROM ${source} WHERE ${where} ORDER BY ${a.createdAt} DESC,${a.id} DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      );
      return { query: q, count: Number(total.count), rows: Array.from(rows) };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
