"use client";

import { useState, type FormEvent } from "react";
import { CustomSelect } from "@/components/custom-select";

export type MasterRow = {
  id: string;
  name: string;
  code?: string | null;
  managerUserId?: string | null;
  description?: string | null;
  isActive: boolean;
};
export function MasterDataManager({
  initialRows,
  kind,
  managers = [],
}: {
  initialRows: MasterRow[];
  kind: "departments" | "projects" | "reports";
  managers?: { id: string; displayName: string; username: string; isActive: boolean }[];
}) {
  const [managerUserId, setManager] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const label = kind === "departments" ? "واحد" : kind === "projects" ? "پروژه" : "گزارش";
  const url = kind === "reports" ? "/api/admin/reports-master" : `/api/admin/${kind}`;
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
          ...(kind !== "reports"
            ? { code: values.get("code") || null, managerUserId: managerUserId || null }
            : {}),
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
      setManager("");
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
                {kind !== "reports" && <th>کد</th>}
                <th>نام</th>
                {kind !== "reports" && <th>مدیر</th>}
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  {kind !== "reports" && <td dir="auto">{row.code || "—"}</td>}
                  <td>{row.name}</td>
                  {kind !== "reports" && (
                    <td>
                      {managers.find((m) => m.id === row.managerUserId)?.displayName ||
                        "مدیر تعیین نشده"}
                    </td>
                  )}
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
                          setManager(row.managerUserId || "");
                          setError("");
                          setMessage("");
                        }}
                      >
                        ویرایش
                      </button>
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
        <form key={editing?.id || "new"} onSubmit={save} className="admin-form">
          <fieldset disabled={busy}>
            <label className="field">
              نام
              <input name="name" required maxLength={160} defaultValue={editing?.name || ""} />
            </label>
            {kind !== "reports" && (
              <>
                {" "}
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
                <CustomSelect
                  searchable
                  ariaLabel="مدیر"
                  value={managerUserId}
                  onChange={setManager}
                  options={[
                    { value: "", label: "انتخاب مدیر" },
                    ...managers
                      .filter((m) => m.isActive || m.id === managerUserId)
                      .map((m) => ({
                        value: m.id,
                        label: `${m.displayName} / ${m.username}${m.isActive ? "" : " (غیرفعال)"}`,
                      })),
                  ]}
                />
              </>
            )}
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
                    setManager("");
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
