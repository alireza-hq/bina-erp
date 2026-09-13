"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CustomSelect } from "@/components/custom-select";

export type MasterRow = {
  id: string;
  name: string;
  code: string | null;
  description?: string | null;
  isActive: boolean;
};
export function MasterDataManager({
  initialRows,
  kind,
  projectId,
  parentActive = true,
}: {
  initialRows: MasterRow[];
  kind: "departments" | "projects" | "files";
  projectId?: string;
  parentActive?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const label = kind === "departments" ? "واحد" : kind === "projects" ? "پروژه" : "فایل پروژه";
  const url = kind === "files" ? `/api/admin/projects/${projectId}/files` : `/api/admin/${kind}`;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (
      editing?.isActive &&
      values.get("isActive") !== "on" &&
      !window.confirm(
        `آیا از غیرفعال کردن ${label} «${editing.name}» مطمئن هستید؟ سوابق حفظ می‌شوند.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(editing ? `${url}/${editing.id}` : url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.get("name"),
          code: values.get("code") || null,
          ...(kind !== "departments" ? { description: values.get("description") || null } : {}),
          isActive: values.get("isActive") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "ذخیره انجام نشد");
      setRows((current) =>
        editing
          ? current.map((row) => (row.id === editing.id ? result.data : row))
          : [...current, result.data],
      );
      setEditing(null);
      form.reset();
      setMessage("تغییرات ذخیره شد.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (row) =>
      `${row.name} ${row.code || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (status === "all" || row.isActive === (status === "active")),
  );
  return (
    <div className="admin-grid">
      <section className="admin-surface">
        <div className="admin-toolbar">
          <label className="field">
            جستجو
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`نام یا کد ${label}`}
            />
          </label>
          <CustomSelect
            value={status}
            onChange={setStatus}
            ariaLabel="فیلتر وضعیت"
            options={[
              { value: "all", label: "همه وضعیت‌ها" },
              { value: "active", label: "فعال" },
              { value: "inactive", label: "غیرفعال" },
            ]}
          />
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>کد</th>
                <th>نام</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td dir="auto">{row.code || "—"}</td>
                  <td>{row.name}</td>
                  <td>
                    <span className={`status-label ${row.isActive ? "on" : "off"}`}>
                      {row.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(row);
                          setError("");
                          setMessage("");
                        }}
                      >
                        ویرایش
                      </button>
                      {kind === "projects" && (
                        <Link className="subtle-button" href={`/system/projects/${row.id}`}>
                          جزئیات و فایل‌ها
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="admin-empty">موردی پیدا نشد.</p>}
      </section>
      <section className="admin-surface">
        <h2>{editing ? `ویرایش ${label}` : `افزودن ${label}`}</h2>
        {kind === "files" && (
          <p className="admin-help">
            مقادیر از پیش تعریف‌شده برای انتخاب در گزارش کار؛ مانند PID-001 یا Vendor Doc 77
          </p>
        )}
        {!parentActive && (
          <p className="form-alert">
            پروژه غیرفعال است. افزودن یا فعال‌سازی مجدد فایل نیازمند فعال بودن پروژه است.
          </p>
        )}
        <form key={editing?.id || "new"} onSubmit={save} className="admin-form">
          <fieldset disabled={busy || (!editing && !parentActive)}>
            <label className="field">
              نام
              <input name="name" required maxLength={160} defaultValue={editing?.name || ""} />
            </label>
            <label className="field">
              کد {kind === "departments" && "(اختیاری)"}
              <input
                name="code"
                dir="auto"
                required={kind !== "departments"}
                maxLength={80}
                defaultValue={editing?.code || ""}
              />
            </label>
            {kind !== "departments" && (
              <label className="field">
                توضیحات
                <textarea
                  name="description"
                  maxLength={2000}
                  defaultValue={editing?.description || ""}
                />
              </label>
            )}
            <label className="check-field">
              <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />
              فعال
            </label>
            <p className="admin-help">غیرفعال‌سازی، سوابق و ارتباط‌های موجود را حذف نمی‌کند.</p>
            <div className="admin-actions">
              <button className="primary-button" type="submit">
                {busy ? "در حال ذخیره…" : "ذخیره"}
              </button>
              {editing && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setError("");
                  }}
                >
                  انصراف
                </button>
              )}
            </div>
          </fieldset>
        </form>
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
