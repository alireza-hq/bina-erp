import { ZodError } from "zod";
import { PeriodError } from "@/lib/period-model";
import { requireApiRole } from "@/lib/auth";
import { APP_ROLES } from "@/lib/roles";
import { jsonError } from "@/lib/api";
import {
  getOwnWorkEntriesForDate,
  getOwnWorkWeek,
  getActiveWorkProjects,
  getActiveWorkReports,
  updateOwnDailyEntries,
  WorkEntryError,
} from "@/lib/work-entries";
import { WORK_LIMITS, todayInTehran } from "@/lib/work-reporting";

function ok(data: unknown) {
  return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
function failure(error: unknown) {
  if (error instanceof PeriodError) return jsonError(error.message, error.status);
  if (error instanceof WorkEntryError) return jsonError(error.message, error.status);
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const row = typeof issue?.path[1] === "number" ? `ردیف ${issue.path[1] + 1}: ` : "";
    return jsonError(row + (issue?.message || "اطلاعات نامعتبر است"));
  }
  operationalLog("work.request_failed", error);
  return jsonError("عملیات گزارش کار انجام نشد. دوباره تلاش کنید.", 500);
}
async function boundedJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new WorkEntryError("درخواست باید JSON باشد", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkEntryError("درخواست خالی است");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > WORK_LIMITS.maxBodyBytes) {
      await reader.cancel();
      throw new WorkEntryError("حجم درخواست بیش از حد مجاز است", 413);
    }
    chunks.push(result.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkEntryError("ساختار درخواست معتبر نیست");
  }
}
function checkQuery(request: Request, allowed: string[]) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length > 1)
      throw new WorkEntryError("پارامتر درخواست نامعتبر است");
  return params;
}
export async function ownWeekApi(request: Request) {
  try {
    const actor = await requireApiRole(request, ...APP_ROLES);
    if ("error" in actor) return actor.error;
    const query = checkQuery(request, ["week"]);
    return ok(await getOwnWorkWeek(actor.user.id, query.get("week") || todayInTehran()));
  } catch (error) {
    return failure(error);
  }
}
export async function ownDayApi(request: Request, date: string) {
  try {
    const actor = await requireApiRole(request, ...APP_ROLES);
    if ("error" in actor) return actor.error;
    checkQuery(request, []);
    return ok(
      request.method === "GET"
        ? await getOwnWorkEntriesForDate(actor.user.id, date)
        : await updateOwnDailyEntries(actor.user.id, date, await boundedJson(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function workOptionsApi(request: Request) {
  try {
    const actor = await requireApiRole(request, ...APP_ROLES);
    if ("error" in actor) return actor.error;
    const query = checkQuery(request, ["kind"]);
    if (query.get("kind") && query.get("kind") !== "reports")
      throw new WorkEntryError("پارامتر نامعتبر است");
    return ok(
      query.get("kind") === "reports"
        ? await getActiveWorkReports()
        : await getActiveWorkProjects(),
    );
  } catch (error) {
    return failure(error);
  }
}
import { operationalLog } from "@/lib/operational-log";
