"use client";
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
  projectFileId: string;
  description: string;
  manHours: string;
};
const emptyRow = (key: string): Draft => ({
  key,
  projectId: "",
  projectFileId: "",
  description: "",
  manHours: "",
});
const draftRows = (day: OwnDay) =>
  day.entries.map((row) => ({
    key: row.id,
    id: row.id,
    projectId: row.projectId,
    projectFileId: row.projectFileId,
    description: row.description,
    manHours: row.manHours,
  }));

function FileSelector({
  row,
  original,
  disabled,
  onChange,
  index,
}: {
  row: Draft;
  original?: OwnDay["entries"][number];
  disabled: boolean;
  onChange: (id: string) => void;
  index: number;
}) {
  const [result, setResult] = useState<{ projectId: string; options: Choice[]; error: string }>({
    projectId: "",
    options: [],
    error: "",
  });
  const [retry, setRetry] = useState(0);
  const historicalParent = original?.projectId === row.projectId && !original.projectActive;
  useEffect(() => {
    if (!row.projectId || historicalParent) return;
    const controller = new AbortController();
    fetch(`/api/work-entry-options?projectId=${encodeURIComponent(row.projectId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "نشست منقضی یا حساب غیرفعال شده است؛ دوباره وارد شوید."
              : value.message || "دریافت فایل‌های پروژه انجام نشد",
          );
        if (!controller.signal.aborted)
          setResult({ projectId: row.projectId, options: value.data, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            projectId: row.projectId,
            options: [],
            error: error instanceof Error ? error.message : "خطای ارتباط",
          });
      });
    return () => controller.abort();
  }, [row.projectId, historicalParent, retry]);
  const loading = Boolean(row.projectId) && !historicalParent && result.projectId !== row.projectId;
  const choices =
    !historicalParent && result.projectId === row.projectId ? [...result.options] : [];
  if (
    original &&
    original.projectId === row.projectId &&
    !choices.some((c) => c.id === original.projectFileId)
  )
    choices.push({
      id: original.projectFileId,
      name: `${original.fileName}${!original.fileActive || !original.projectActive ? " (غیرفعال؛ سابقه موجود)" : ""}`,
      code: original.fileCode,
    });
  const error = result.projectId === row.projectId ? result.error : "";
  return (
    <>
      <CustomSelect
        value={row.projectFileId}
        onChange={onChange}
        disabled={disabled || !row.projectId || loading || Boolean(error)}
        ariaLabel={`فایل پروژه ردیف ${index + 1}`}
        options={[
          { value: "", label: loading ? "در حال بارگذاری…" : "انتخاب فایل پروژه" },
          ...choices.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        ]}
      />
      {loading && <small role="status">در حال دریافت فایل‌ها…</small>}
      {!loading && row.projectId && !choices.length && !error && (
        <small>این پروژه فایل فعال ندارد.</small>
      )}
      {error && (
        <div role="alert" className="field-error">
          {error}{" "}
          <button
            type="button"
            className="subtle-button"
            onClick={() => setRetry((v) => v + 1)}
            disabled={disabled}
          >
            تلاش دوباره
          </button>
        </div>
      )}
    </>
  );
}

export function WorkDayEditor({
  initialDay,
  projects,
  today,
}: {
  initialDay: OwnDay;
  projects: Choice[];
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
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const [expired, setExpired] = useState(false);
  const total = rows.reduce((sum, row) => sum + (hoursToHundredths(row.manHours) ?? 0), 0);
  function updateRow(key: string, change: Partial<Draft>) {
    setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setDirty(true);
    setSuccess("");
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
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
      entries: rows.map(({ id, projectId, projectFileId, description, manHours }) => ({
        ...(id ? { id } : {}),
        projectId,
        projectFileId,
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
      setDirty(false);
      setSuccess("گزارش این روز با موفقیت ذخیره شد.");
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
          <p>چند فعالیت را برای یک روز وارد کنید و با هم ذخیره کنید.</p>
        </div>
        <Link
          className="secondary-button"
          href="/reports"
          onClick={(event) => {
            if (dirty && !window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))
              event.preventDefault();
          }}
        >
          گزارش‌های من
        </Link>
      </header>
      <section className="admin-surface">
        <p role="status">{locked ? LOCKED_MESSAGE : "این هفته باز است"}</p>
        <fieldset disabled={busy} className="report-date-field">
          <span>تاریخ</span>
          <JalaliDatePicker value={day.date} onChange={changeDate} ariaLabel="تاریخ گزارش کار" />
        </fieldset>
        {!projects.length && (
          <p className="form-alert">
            پروژه فعالی برای ثبت جدید وجود ندارد. با فناوری اطلاعات تماس بگیرید.
          </p>
        )}
        <form onSubmit={save} noValidate>
          <div className="admin-table-scroll">
            <table className="admin-table work-editor-table">
              <thead>
                <tr>
                  <th>پروژه</th>
                  <th>فایل پروژه</th>
                  <th>شرح فعالیت</th>
                  <th>نفر-ساعت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const original = day.entries.find((entry) => entry.id === row.id);
                  const choices = [...projects];
                  if (original && !choices.some((p) => p.id === original.projectId))
                    choices.push({
                      id: original.projectId,
                      name: `${original.projectName} (غیرفعال؛ سابقه موجود)`,
                      code: original.projectCode,
                    });
                  return (
                    <tr key={row.key}>
                      <td>
                        <CustomSelect
                          value={row.projectId}
                          disabled={readOnly}
                          ariaLabel={`پروژه ردیف ${index + 1}`}
                          options={[
                            { value: "", label: "انتخاب پروژه" },
                            ...choices.map((p) => ({
                              value: p.id,
                              label: `${p.code} — ${p.name}`,
                            })),
                          ]}
                          onChange={(projectId) => {
                            if (projectId !== row.projectId)
                              updateRow(row.key, { projectId, projectFileId: "" });
                          }}
                        />
                      </td>
                      <td>
                        <FileSelector
                          row={row}
                          original={original}
                          index={index}
                          disabled={readOnly}
                          onChange={(projectFileId) => updateRow(row.key, { projectFileId })}
                        />
                      </td>
                      <td>
                        <textarea
                          aria-label={`شرح فعالیت ردیف ${index + 1}`}
                          disabled={readOnly}
                          maxLength={WORK_LIMITS.descriptionLength}
                          value={row.description}
                          onChange={(event) =>
                            updateRow(row.key, { description: event.target.value })
                          }
                          rows={2}
                        />
                      </td>
                      <td>
                        <input
                          className="hours-input"
                          aria-label={`نفر-ساعت ردیف ${index + 1}`}
                          inputMode="decimal"
                          dir="ltr"
                          maxLength={16}
                          disabled={readOnly}
                          placeholder="1.5"
                          value={row.manHours}
                          onChange={(event) => updateRow(row.key, { manHours: event.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-label={`حذف ردیف ${index + 1}`}
                          className="secondary-button"
                          disabled={readOnly}
                          onClick={() => {
                            setRows((rows) => rows.filter((r) => r.key !== row.key));
                            setDirty(true);
                            setSuccess("");
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
                : "ردیفی وجود ندارد. ذخیره، تمام ردیف‌های قبلی این روز شما را حذف می‌کند."}
            </p>
          )}
          <div className="report-editor-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={readOnly || rows.length >= WORK_LIMITS.maxRows}
              onClick={() => {
                setRows((rows) => [...rows, emptyRow(crypto.randomUUID())]);
                setDirty(true);
                setSuccess("");
              }}
            >
              + افزودن ردیف
            </button>
            <strong>جمع روز: {toPersianDigits(displayHours(total))} نفر-ساعت</strong>
            <button
              className="primary-button"
              type="submit"
              disabled={readOnly || expired || day.date > today}
            >
              {busy ? "در حال ذخیره…" : "ذخیره"}
            </button>
          </div>
          <p className="admin-help">
            حداکثر ۵۰ ردیف، ۲۴ ساعت در روز و دو رقم اعشار. تغییرات پس از ذخیره اعمال می‌شوند.
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
