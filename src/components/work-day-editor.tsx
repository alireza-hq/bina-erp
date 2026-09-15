"use client";
import { statusLabels } from "@/lib/approval-model";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CustomSelect } from "@/components/custom-select";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import type { OwnDay } from "@/lib/work-entries";
import { dailyEntriesSchema } from "@/lib/work-validation";
import { WORK_LIMITS, displayHours, hoursToHundredths, isCalendarDate } from "@/lib/work-reporting";
import { toPersianDigits } from "@/lib/persian";
import { LOCKED_MESSAGE } from "@/lib/period-model";

type Choice = { id: string; name: string; code: string };
type Draft = {
  key: string;
  id?: string;
  projectId: string;
  reportId: string;
  description: string;
  manHours: string;
};
const emptyRow = (key: string): Draft => ({
  key,
  projectId: "",
  reportId: "",
  description: "",
  manHours: "",
});
const draftRows = (day: OwnDay) =>
  day.entries.map((row) => ({
    key: row.id,
    id: row.id,
    projectId: row.projectId,
    reportId: row.reportId,
    description: row.description,
    manHours: row.manHours,
  }));
const fingerprint = (rows: Draft[]) =>
  JSON.stringify(
    rows.map(({ id, projectId, reportId, description, manHours }) => ({
      id,
      projectId,
      reportId,
      description,
      manHours: hoursToHundredths(manHours) ?? manHours,
    })),
  );

export function WorkDayEditor({
  initialDay,
  projects,
  reports,
  today,
}: {
  initialDay: OwnDay;
  projects: Choice[];
  reports: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [rows, setRows] = useState<Draft[]>(() =>
    initialDay.entries.length
      ? draftRows(initialDay)
      : initialDay.period.status === "LOCKED"
        ? []
        : [emptyRow("new-0")],
  );
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(initialDay.period.status === "LOCKED");
  const readOnly = busy || locked;
  const saving = useRef(false);
  const editor = useRef<HTMLFormElement>(null);
  const focusRow = useRef<string | null>(null);
  useEffect(() => {
    if (!focusRow.current) return;
    editor.current
      ?.querySelector<HTMLElement>(`[data-row-key="${focusRow.current}"] button`)
      ?.focus();
    focusRow.current = null;
  }, [rows]);
  function appendRow(source?: Draft) {
    const key = crypto.randomUUID();
    const original = day.entries.find((entry) => entry.id === source?.id);
    const reusable = !original || (original.projectActive && original.reportActive);
    const next = source
      ? {
          ...source,
          key,
          id: undefined,
          ...(!reusable ? { projectId: "", reportId: "" } : {}),
        }
      : emptyRow(key);
    focusRow.current = key;
    setRows((current) => [...current, next]);
    setSuccess("");
  }
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(rows));
  const dirty = fingerprint(rows) !== savedFingerprint;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const [expired, setExpired] = useState(false);
  const total = rows.reduce((sum, row) => sum + (hoursToHundredths(row.manHours) ?? 0), 0);
  function updateRow(key: string, change: Partial<Draft>) {
    setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setSuccess("");
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        link.href === window.location.href
      )
        return;
      if (!window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);
  function changeDate(date: string) {
    if (!isCalendarDate(date) || date > today) {
      setError("تاریخ باید از سال ۲۰۰۰ تا امروز باشد.");
      return;
    }
    if (date === day.date) return;
    if (dirty && !window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟")) return;
    router.push(`/reports/${date}`);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || locked) return;
    setError("");
    setSuccess("");
    setConflict(false);
    setExpired(false);
    const parsed = dailyEntriesSchema.safeParse({
      version: day.version,
      entries: rows.map(({ id, projectId, reportId, description, manHours }) => ({
        ...(id ? { id } : {}),
        projectId,
        reportId,
        description,
        manHours,
      })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0],
        row = issue.path[1];
      setError(`${typeof row === "number" ? `ردیف ${row + 1}: ` : ""}${issue.message}`);
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/work-entries/${day.date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const value = await response.json();
      if (!response.ok) {
        if (response.status === 423) setLocked(true);
        setConflict(response.status === 409);
        setExpired(response.status === 401);
        throw new Error(value.message || "ذخیره انجام نشد");
      }
      setDay(value.data);
      setRows(draftRows(value.data));
      router.refresh();
      setSavedFingerprint(fingerprint(draftRows(value.data)));
      setSuccess("گزارش‌ها برای تأیید ارسال شدند.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد. ردیف‌ها حفظ شده‌اند.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-title">
        <div>
          <h1>ثبت گزارش کار</h1>
          <p>ردیف‌های جدید و ردشده با هم برای تأیید مدیر واحد ارسال می‌شوند.</p>
        </div>
        <Link className="secondary-button" href="/reports">
          گزارش‌های من
        </Link>
      </header>
      <section className="admin-surface">
        <p className={`period-banner ${locked ? "locked" : "open"}`} role="status">
          {locked ? LOCKED_MESSAGE : "این هفته باز است"}
        </p>
        <fieldset disabled={busy} className="report-date-field">
          <span>تاریخ</span>
          <JalaliDatePicker value={day.date} onChange={changeDate} ariaLabel="تاریخ گزارش کار" />
        </fieldset>
        {!projects.length && (
          <p className="form-alert">
            پروژه فعالی برای ثبت جدید وجود ندارد. با فناوری اطلاعات تماس بگیرید.
          </p>
        )}
        <form ref={editor} onSubmit={save} noValidate aria-busy={busy}>
          <div className="admin-table-scroll">
            <table className="admin-table work-editor-table">
              <thead>
                <tr>
                  <th>پروژه</th>
                  <th>گزارش</th>
                  <th>نفر-ساعت</th>
                  <th>توضیحات / ملاحظات</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const original = day.entries.find((entry) => entry.id === row.id);
                  const rowReadOnly =
                    readOnly || Boolean(original && original.status !== "REJECTED");
                  const reportChoices = [...reports];
                  if (original && !reportChoices.some((r) => r.id === original.reportId))
                    reportChoices.push({
                      id: original.reportId,
                      name: original.reportName + " (سابقه)",
                    });
                  const choices = [...projects];
                  if (original && !choices.some((p) => p.id === original.projectId))
                    choices.push({
                      id: original.projectId,
                      name: `${original.projectName} (غیرفعال؛ سابقه موجود)`,
                      code: original.projectCode,
                    });
                  return (
                    <tr key={row.key} data-row-key={row.key}>
                      <td>
                        <CustomSelect
                          searchable
                          value={row.projectId}
                          disabled={rowReadOnly}
                          ariaLabel={`پروژه ردیف ${index + 1}`}
                          options={[
                            { value: "", label: "انتخاب پروژه" },
                            ...choices.map((p) => ({
                              value: p.id,
                              label: `${p.code} — ${p.name}`,
                            })),
                          ]}
                          onChange={(projectId) => {
                            if (projectId !== row.projectId) updateRow(row.key, { projectId });
                          }}
                        />
                      </td>
                      <td>
                        <CustomSelect
                          searchable
                          ariaLabel={`گزارش ردیف ${index + 1}`}
                          value={row.reportId}
                          onChange={(reportId) => updateRow(row.key, { reportId })}
                          disabled={rowReadOnly}
                          options={[
                            { value: "", label: "انتخاب گزارش" },
                            ...reportChoices.map((r) => ({ value: r.id, label: r.name })),
                          ]}
                        />
                      </td>
                      <td>
                        <input
                          className="hours-input"
                          aria-label={`نفر-ساعت ردیف ${index + 1}`}
                          inputMode="decimal"
                          dir="ltr"
                          maxLength={16}
                          disabled={rowReadOnly}
                          placeholder="1.5"
                          value={row.manHours}
                          onChange={(event) => updateRow(row.key, { manHours: event.target.value })}
                        />
                      </td>
                      <td>
                        <textarea
                          aria-label={`توضیحات / ملاحظات ردیف ${index + 1}`}
                          disabled={rowReadOnly}
                          maxLength={WORK_LIMITS.descriptionLength}
                          value={row.description}
                          onChange={(event) =>
                            updateRow(row.key, { description: event.target.value })
                          }
                          rows={2}
                        />
                      </td>
                      <td>
                        {original ? statusLabels[original.status] : "جدید"}
                        {original?.status === "REJECTED" &&
                          day.history
                            ?.filter((h) => h.workEntryId === row.id && h.decision === "REJECTED")
                            .slice(0, 1)
                            .map((h) => (
                              <small key={h.id}>
                                {h.stage === "DEPARTMENT" ? "مدیر واحد" : "مدیر پروژه"} —{" "}
                                {h.managerName}: {h.rejectionReason}
                              </small>
                            ))}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="subtle-button"
                          aria-label={`کپی ردیف ${index + 1}`}
                          disabled={readOnly || rows.length >= WORK_LIMITS.maxRows}
                          onClick={() => appendRow(row)}
                        >
                          کپی ردیف
                        </button>
                        <button
                          type="button"
                          aria-label={`حذف ردیف ${index + 1}`}
                          className="secondary-button"
                          disabled={readOnly || Boolean(row.id)}
                          onClick={() => {
                            setRows((rows) => rows.filter((r) => r.key !== row.key));
                            setSuccess("");
                            requestAnimationFrame(() =>
                              editor.current
                                ?.querySelector<HTMLButtonElement>("[data-add-row]")
                                ?.focus(),
                            );
                          }}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="admin-help">
              {locked
                ? "فعالیتی برای این روز ثبت نشده است."
                : "ردیفی وجود ندارد. یک ردیف جدید اضافه کنید."}
            </p>
          )}
          <div className="report-editor-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={readOnly || rows.length >= WORK_LIMITS.maxRows}
              data-add-row
              onClick={() => appendRow()}
            >
              + افزودن ردیف
            </button>
            <strong aria-live="polite">
              جمع روز: {toPersianDigits(displayHours(total))} نفر-ساعت
            </strong>
            <button
              className="primary-button"
              type="submit"
              disabled={readOnly || expired || day.date > today}
            >
              {busy ? "در حال ارسال…" : "ارسال / ارسال مجدد ردیف‌های ردشده"}
            </button>
          </div>
          <p className="admin-help" role="status">
            {busy
              ? "در حال ذخیره گزارش؛ لطفاً صبر کنید…"
              : dirty
                ? "تغییرات ذخیره‌نشده دارید."
                : ""}
          </p>
          <p className="admin-help">
            حداکثر ۵۰ ردیف، ۲۴ ساعت در روز و دو رقم اعشار. پس از ارسال، ردیف‌ها تا زمان رد شدن قابل
            ویرایش نیستند.
          </p>
          {total > WORK_LIMITS.warningHundredths && (
            <p className="report-warning" role="status">
              مجموع نفر-ساعت این روز {toPersianDigits(displayHours(total))} ساعت است؛ لطفاً بررسی
              کنید.
            </p>
          )}
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          {expired && (
            <Link href="/login" target="_blank" className="secondary-button">
              ورود دوباره در پنجره جدید
            </Link>
          )}
          {expired && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setExpired(false);
                setError("");
              }}
            >
              وارد شدم؛ تلاش دوباره
            </button>
          )}
          {conflict && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (window.confirm("ردیف‌های فعلی کنار گذاشته و آخرین نسخه بارگذاری شود؟"))
                  window.location.reload();
              }}
            >
              بارگذاری آخرین نسخه
            </button>
          )}
          {success && (
            <p role="status" className="success-message">
              {success}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
