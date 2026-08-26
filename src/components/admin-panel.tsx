"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FolderKanban,
  KeyRound,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CustomSelect } from "@/components/custom-select";
import { persianizeInputValue } from "@/lib/persian";
import { permissionSchema, projectSchema } from "@/lib/validation";

type User = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: "admin" | "user";
  active: boolean;
};
type Project = { id: string; name: string; code: string };
type Permission = { projectId: string; userId: string; permission: "read" | "write" };
async function api(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ message: "خطای نامشخص" }));
  if (!response.ok) throw new Error(result.message || "عملیات انجام نشد");
  return result;
}
function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project?.name || "", code: project?.code || "" },
  });
  return (
    <form
      noValidate
      className="compact-form"
      onSubmit={handleSubmit(async (values) => {
        await api(
          project ? `/api/admin/projects/${project.id}` : "/api/admin/projects",
          project ? "PATCH" : "POST",
          values,
        );
        onDone();
      })}
    >
      <div className="field">
        <label>نام پروژه</label>
        <input
          placeholder="مثلاً پروژه توسعه"
          {...register("name")}
          onInput={(event) => {
            event.currentTarget.value = persianizeInputValue(event.currentTarget.value);
          }}
        />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
      </div>
      <div className="field">
        <label>کد پروژه</label>
        <input dir="ltr" placeholder="مثلاً DEV-01" {...register("code")} />
        {errors.code && <p className="field-error">{errors.code.message}</p>}
      </div>
      <button className="primary-button" disabled={isSubmitting}>
        <Save size={16} />
        {project ? "ذخیره" : "افزودن پروژه"}
      </button>
    </form>
  );
}
function PermissionSelect({
  user,
  project,
  value,
  onDone,
}: {
  user: User;
  project: Project;
  value: "none" | "read" | "write";
  onDone: () => void;
}) {
  const {
    register,
    control,
    formState: { isSubmitting },
  } = useForm<z.input<typeof permissionSchema>>({
    resolver: zodResolver(permissionSchema),
    defaultValues: { userId: user.id, projectId: project.id, permission: value },
  });
  return (
    <form noValidate className="permission-form">
      <input type="hidden" {...register("userId")} />
      <input type="hidden" {...register("projectId")} />
      <Controller
        control={control}
        name="permission"
        render={({ field }) => (
          <CustomSelect
            ariaLabel={`دسترسی ${user.displayName} به ${project.name}`}
            disabled={isSubmitting || user.role !== "user"}
            value={field.value}
            options={[
              { value: "none", label: "بدون دسترسی" },
              { value: "read", label: "مشاهده" },
              { value: "write", label: "ویرایش" },
            ]}
            onChange={async (permission) => {
              field.onChange(permission);
              const values = { userId: user.id, projectId: project.id, permission };
              if (!permissionSchema.safeParse(values).success) return;
              await api("/api/admin/permissions", "PUT", values);
              onDone();
            }}
          />
        )}
      />
    </form>
  );
}
export function AdminPanel({
  actor,
  users,
  projects,
  permissions,
}: {
  actor: User;
  users: User[];
  projects: Project[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "projects" | "access">("users");
  const [editing, setEditing] = useState<Project | null>(null);
  const [message, setMessage] = useState("");
  function done(text = "تغییرات ذخیره شد") {
    setMessage(text);
    setEditing(null);
    router.refresh();
    setTimeout(() => setMessage(""), 2500);
  }
  async function updateUser(user: User, patch: { role?: User["role"]; active?: boolean }) {
    try {
      await api(`/api/admin/users/${user.id}`, "PATCH", patch);
      done();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا");
    }
  }
  async function removeProject(project: Project) {
    if (!confirm(`پروژه «${project.name}» و تمام نامه‌های آن حذف شود؟`)) return;
    try {
      await api(`/api/admin/projects/${project.id}`, "DELETE");
      done("پروژه حذف شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا");
    }
  }
  return (
    <>
      <div className="section-tabs">
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          <UsersRound size={17} />
          کاربران
        </button>
        <button className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>
          <FolderKanban size={17} />
          پروژه‌ها
        </button>
        <button className={tab === "access" ? "active" : ""} onClick={() => setTab("access")}>
          <KeyRound size={17} />
          دسترسی‌ها
        </button>
      </div>
      {message && <div className="toast">{message}</div>}
      {tab === "users" && (
        <section className="surface">
          <div className="surface-head">
            <div>
              <h2>کاربران سازمانی</h2>
              <p>کاربران پس از اولین ورود LDAP در این فهرست ظاهر می‌شوند.</p>
            </div>
            <span className="count-badge">{users.length.toLocaleString("fa-IR")}</span>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <div className="admin-user" key={user.id}>
                <span className="account-avatar">{user.displayName.slice(0, 1)}</span>
                <div className="user-copy">
                  <strong>{user.displayName}</strong>
                  <span dir="ltr">{user.email || user.username}</span>
                </div>
                <span className={`status-dot ${user.active ? "on" : "off"}`}>
                  {user.active ? "فعال" : "غیرفعال"}
                </span>
                {user.id !== actor.id ? (
                  <>
                    <CustomSelect
                      ariaLabel={`نقش ${user.displayName}`}
                      value={user.role}
                      options={[
                        { value: "user", label: "کاربر" },
                        { value: "admin", label: "مدیر" },
                      ]}
                      onChange={(role) => updateUser(user, { role })}
                    />
                    <button
                      className="subtle-button"
                      onClick={() => updateUser(user, { active: !user.active })}
                    >
                      {user.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                    </button>
                  </>
                ) : (
                  <span className="role-badge">
                    <ShieldCheck size={14} />
                    {user.role === "admin" ? "مدیر" : "کاربر"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "projects" && (
        <div className="admin-layout">
          <section className="surface form-surface">
            <div className="surface-head">
              <div>
                <h2>{editing ? "ویرایش پروژه" : "پروژه جدید"}</h2>
                <p>
                  {editing
                    ? "نام و کد پروژه را اصلاح کنید."
                    : "برای پروژه، اولین شیت خودکار ساخته می‌شود."}
                </p>
              </div>
              {editing && (
                <button className="icon-button" onClick={() => setEditing(null)}>
                  ×
                </button>
              )}
            </div>
            <ProjectForm
              key={editing?.id || "new"}
              project={editing || undefined}
              onDone={() => done(editing ? "پروژه ویرایش شد" : "پروژه ساخته شد")}
            />
          </section>
          <section className="surface">
            <div className="surface-head">
              <div>
                <h2>همه پروژه‌ها</h2>
                <p>مدیریت اطلاعات و حذف پروژه‌ها</p>
              </div>
            </div>
            <div className="project-admin-list">
              {projects.map((project) => (
                <div key={project.id}>
                  <span className="tile-icon">
                    <FolderKanban size={18} />
                  </span>
                  <div className="user-copy">
                    <strong>{project.name}</strong>
                    <span dir="ltr">{project.code}</span>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => setEditing(project)}
                    aria-label="ویرایش"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => removeProject(project)}
                    aria-label="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {tab === "access" && (
        <section className="surface">
          <div className="surface-head">
            <div>
              <h2>دسترسی پروژه‌ها</h2>
              <p>
                سطح مشاهده یا ویرایش را برای هر کاربر تعیین کنید. مدیران به همه پروژه‌ها دسترسی کامل
                دارند.
              </p>
            </div>
          </div>
          <div className="matrix-scroll">
            <table className="permission-table">
              <thead>
                <tr>
                  <th>کاربر</th>
                  {projects.map((project) => (
                    <th key={project.id}>{project.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <small>{user.username}</small>
                    </td>
                    {projects.map((project) => {
                      const value =
                        user.role !== "user"
                          ? "write"
                          : permissions.find(
                              (item) => item.userId === user.id && item.projectId === project.id,
                            )?.permission || "none";
                      return (
                        <td key={project.id}>
                          <PermissionSelect
                            user={user}
                            project={project}
                            value={value}
                            onDone={() => done()}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
