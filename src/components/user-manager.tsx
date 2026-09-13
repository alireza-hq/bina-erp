"use client";
import { useState, type FormEvent } from "react";
import { CustomSelect } from "@/components/custom-select";
import { APP_ROLES, roleLabels, type AppRole } from "@/lib/roles";

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: AppRole;
  isActive: boolean;
  departmentId: string | null;
  employeeCode: string | null;
  lastLoginAt: string | null;
};
type Department = { id: string; name: string; isActive: boolean };
export function UserManager({
  initialRows,
  departments,
  actorId,
}: {
  initialRows: UserRow[];
  departments: Department[];
  actorId: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const visible = rows.filter(
    (row) =>
      `${row.username} ${row.displayName} ${row.employeeCode || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (roleFilter === "all" || row.role === roleFilter) &&
      (status === "all" || row.isActive === (status === "active")),
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (
      !editing.isActive &&
      rows.find((row) => row.id === editing.id)?.isActive &&
      !window.confirm(
        `حساب «${editing.displayName}» غیرفعال شود؟ نشست‌های ورود این کاربر باطل می‌شوند.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editing.role,
          departmentId: editing.departmentId,
          employeeCode: editing.employeeCode,
          isActive: editing.isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "ذخیره انجام نشد");
      setRows((rows) => rows.map((row) => (row.id === editing.id ? result.data : row)));
      setEditing(null);
      setMessage("اطلاعات کاربر ذخیره شد.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-grid">
      <section className="admin-surface">
        <div className="admin-toolbar">
          <label className="field">
            جستجوی کاربر
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="نام، نام کاربری یا کد پرسنلی"
            />
          </label>
          <CustomSelect
            value={roleFilter}
            onChange={setRoleFilter}
            ariaLabel="فیلتر نقش"
            options={[
              { value: "all", label: "همه نقش‌ها" },
              ...APP_ROLES.map((value) => ({ value, label: roleLabels[value] })),
            ]}
          />
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
                <th>کاربر</th>
                <th>نقش / واحد</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.displayName}</strong>
                    <small dir="ltr">{row.username}</small>
                    <small>{row.employeeCode || "بدون کد پرسنلی"}</small>
                  </td>
                  <td>
                    {roleLabels[row.role]}
                    <small>
                      {departments.find((d) => d.id === row.departmentId)?.name || "بدون واحد"}
                    </small>
                  </td>
                  <td>
                    <span className={`status-label ${row.isActive ? "on" : "off"}`}>
                      {row.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setEditing({ ...row });
                        setError("");
                        setMessage("");
                      }}
                    >
                      ویرایش
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="admin-empty">کاربری پیدا نشد.</p>}
      </section>
      <section className="admin-surface">
        <h2>اطلاعات کاربر</h2>
        {!editing ? (
          <p className="admin-help">
            برای تغییر نقش، واحد یا وضعیت، یک کاربر را انتخاب کنید. کاربران پس از اولین ورود سازمانی
            در این فهرست ظاهر می‌شوند.
          </p>
        ) : (
          <form onSubmit={save} className="admin-form">
            <fieldset disabled={busy}>
              <strong>{editing.displayName}</strong>
              <p dir="ltr">{editing.username}</p>
              <p dir="ltr">{editing.email || "—"}</p>
              <p className="admin-help">
                آخرین ورود:{" "}
                {editing.lastLoginAt
                  ? new Date(editing.lastLoginAt).toLocaleString("fa-IR")
                  : "ثبت نشده"}
              </p>
              <label className="field">
                کد پرسنلی
                <input
                  maxLength={80}
                  value={editing.employeeCode || ""}
                  onChange={(event) =>
                    setEditing({ ...editing, employeeCode: event.target.value || null })
                  }
                />
              </label>
              <div className="field">
                <span>نقش</span>
                <CustomSelect
                  value={editing.role}
                  onChange={(role) => setEditing({ ...editing, role })}
                  ariaLabel="نقش کاربر"
                  disabled={busy || editing.id === actorId}
                  options={APP_ROLES.map((value) => ({ value, label: roleLabels[value] }))}
                />
              </div>
              <div className="field">
                <span>واحد</span>
                <CustomSelect
                  value={editing.departmentId || ""}
                  onChange={(departmentId) =>
                    setEditing({ ...editing, departmentId: departmentId || null })
                  }
                  ariaLabel="واحد کاربر"
                  disabled={busy}
                  options={[
                    { value: "", label: "بدون واحد" },
                    ...departments
                      .filter((d) => d.isActive || d.id === editing.departmentId)
                      .map((d) => ({
                        value: d.id,
                        label: d.name + (d.isActive ? "" : " (غیرفعال)"),
                      })),
                  ]}
                />
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  disabled={editing.id === actorId}
                  onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
                />
                حساب فعال
              </label>
              <p className="admin-help">
                غیرفعال‌سازی، نشست‌های کاربر را باطل می‌کند. دسترسی مدیریتی خودتان قابل حذف نیست.
              </p>
              <div className="admin-actions">
                <button className="primary-button">{busy ? "در حال ذخیره…" : "ذخیره"}</button>
                <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
                  انصراف
                </button>
              </div>
            </fieldset>
          </form>
        )}
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
