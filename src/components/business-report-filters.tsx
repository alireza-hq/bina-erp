"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/custom-select";
import { JalaliDatePicker } from "@/components/jalali-date-picker";
import {
  GROUP_DIMENSIONS,
  groupLabels,
  parseBusinessReportQuery,
  reportHref,
  type BusinessReportQuery,
} from "@/lib/business-report-query";
import type { ReportOption } from "@/lib/business-reports";

function SearchOption({
  kind,
  value,
  onChange,
  projectId,
  departmentId,
}: {
  kind: "employee" | "department" | "project" | "projectFile";
  value?: string;
  onChange: (value: string) => void;
  projectId?: string;
  departmentId?: string;
}) {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{
    key: string;
    options: ReportOption[];
    more: boolean;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  const params = new URLSearchParams({ kind, search });
  if (value) params.set("selected", value);
  if (projectId) params.set("projectId", projectId);
  if (departmentId) params.set("departmentId", departmentId);
  const key = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/reports/options?${key}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 401 ? "نشست پایان یافته؛ دوباره وارد شوید" : "گزینه‌ها دریافت نشد",
          );
        const body = await response.json();
        setResult({ key, ...body.data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            options: [],
            more: false,
            error: error instanceof Error ? error.message : "خطا",
          });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, retry]);
  const loading = result?.key !== key;
  return (
    <div>
      <input
        aria-label={`جستجوی ${groupLabels[kind]}`}
        placeholder={`جستجوی ${groupLabels[kind]}`}
        value={search}
        maxLength={100}
        onChange={(e) => setSearch(e.target.value)}
      />
      <CustomSelect
        ariaLabel={groupLabels[kind]}
        value={value || ""}
        onChange={onChange}
        disabled={loading || !!result?.error}
        options={[
          { value: "", label: loading ? "در حال دریافت…" : "همه" },
          ...(loading ? [] : result?.options || []),
          ...(!loading && value && !result?.options.some((option) => option.value === value)
            ? [{ value, label: "انتخاب فعلی با این فیلتر مطابقت ندارد" }]
            : []),
        ]}
      />
      {!loading && !result?.error && !result?.options.length && (
        <small className="admin-help">
          {kind === "employee"
            ? "کاربری برای این واحد / جستجو نیست"
            : kind === "projectFile"
              ? "فایلی برای این پروژه / جستجو نیست"
              : "گزینه‌ای پیدا نشد"}
        </small>
      )}
      {result?.more && !loading && (
        <small className="admin-help">۵۰ گزینه اول؛ جستجو را دقیق‌تر کنید</small>
      )}
      {result?.error && !loading && (
        <button type="button" className="subtle-button" onClick={() => setRetry((n) => n + 1)}>
          {result.error}؛ تلاش دوباره
        </button>
      )}
    </div>
  );
}
export function BusinessReportFilters({ query }: { query: BusinessReportQuery }) {
  const [draft, setDraft] = useState(query);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function update(changes: Partial<BusinessReportQuery>) {
    setDraft((value) => ({ ...value, ...changes }));
  }
  return (
    <form
      className="admin-surface business-filters"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const valid = parseBusinessReportQuery({ ...draft, page: 1, groupPage: 1 });
          setError("");
          startTransition(() => router.push(reportHref(valid)));
        } catch {
          setError("بازه تاریخ (حداکثر ۳۶۶ روز) و گروه‌بندی را بررسی کنید");
        }
      }}
    >
      <h2>انتخاب بازه و فیلترها</h2>
      <p className="admin-help">
        پس از تغییر گزینه‌ها «اعمال فیلترها» را بزنید. خروجی Excel از فیلترهای اعمال‌شده استفاده
        می‌کند.
      </p>
      <fieldset disabled={pending}>
        <div className="business-filter-grid">
          <div>
            <label>از تاریخ</label>
            <JalaliDatePicker
              value={draft.from}
              onChange={(from) => update({ from })}
              ariaLabel="از تاریخ"
            />
          </div>
          <div>
            <label>تا تاریخ</label>
            <JalaliDatePicker
              value={draft.to}
              onChange={(to) => update({ to })}
              ariaLabel="تا تاریخ"
            />
          </div>
          <div>
            <label>واحد</label>
            <SearchOption
              kind="department"
              value={draft.departmentId}
              onChange={(departmentId) =>
                update({ departmentId: departmentId || undefined, employeeId: undefined })
              }
            />
          </div>
          <div>
            <label>کارمند</label>
            <SearchOption
              kind="employee"
              value={draft.employeeId}
              departmentId={draft.departmentId}
              onChange={(employeeId) => update({ employeeId: employeeId || undefined })}
            />
          </div>
          <div>
            <label>پروژه</label>
            <SearchOption
              kind="project"
              value={draft.projectId}
              onChange={(projectId) =>
                update({ projectId: projectId || undefined, projectFileId: undefined })
              }
            />
          </div>
          <div>
            <label>فایل پروژه</label>
            <SearchOption
              kind="projectFile"
              value={draft.projectFileId}
              projectId={draft.projectId}
              onChange={(projectFileId) => update({ projectFileId: projectFileId || undefined })}
            />
          </div>
          <div>
            <label>گروه‌بندی اول</label>
            <CustomSelect
              ariaLabel="گروه‌بندی اول"
              value={draft.groupBy || ""}
              options={[
                { value: "", label: "بدون گروه‌بندی" },
                ...GROUP_DIMENSIONS.map((value) => ({ value, label: groupLabels[value] })),
              ]}
              onChange={(value) =>
                update({
                  groupBy: (value as BusinessReportQuery["groupBy"]) || undefined,
                  groupBySecondary: undefined,
                })
              }
            />
          </div>
          <div>
            <label>گروه‌بندی دوم</label>
            <CustomSelect
              ariaLabel="گروه‌بندی دوم"
              disabled={!draft.groupBy}
              value={draft.groupBySecondary || ""}
              options={[
                { value: "", label: "بدون گروه دوم" },
                ...GROUP_DIMENSIONS.filter((value) => value !== draft.groupBy).map((value) => ({
                  value,
                  label: groupLabels[value],
                })),
              ]}
              onChange={(value) =>
                update({
                  groupBySecondary: (value as BusinessReportQuery["groupBySecondary"]) || undefined,
                })
              }
            />
          </div>
          <div>
            <label>مرتب‌سازی ردیف‌ها</label>
            <CustomSelect
              ariaLabel="مرتب‌سازی"
              value={draft.sort}
              options={[
                ...GROUP_DIMENSIONS.map((value) => ({ value, label: groupLabels[value] })),
                { value: "manHours", label: "نفر-ساعت" },
              ]}
              onChange={(sort) => update({ sort: sort as BusinessReportQuery["sort"] })}
            />
          </div>
          <div>
            <label>ترتیب</label>
            <CustomSelect
              ariaLabel="ترتیب"
              value={draft.direction}
              options={[
                { value: "desc", label: "نزولی" },
                { value: "asc", label: "صعودی" },
              ]}
              onChange={(direction) => update({ direction })}
            />
          </div>
          <div>
            <label>تعداد در صفحه</label>
            <CustomSelect
              ariaLabel="تعداد در صفحه"
              value={String(draft.pageSize)}
              options={[25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(value) => update({ pageSize: Number(value) as 25 | 50 | 100 })}
            />
          </div>
        </div>
        <div className="admin-actions">
          <button type="submit" className="primary-button">
            {pending ? "در حال دریافت…" : "اعمال فیلترها"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => startTransition(() => router.push("/admin/reports"))}
          >
            پاک کردن همه · هفته جاری
          </button>
        </div>
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
