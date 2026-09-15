"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/custom-select";
export function OnboardingForm({ departments }: { departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [departmentId, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: f.get("displayName"), departmentId }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.message || "ذخیره انجام نشد");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ارتباط");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw Error("خروج انجام نشد؛ دوباره تلاش کنید");
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ارتباط");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="admin-form">
      <fieldset disabled={busy}>
        <label className="field">
          نام و نام خانوادگی فارسی
          <input name="displayName" required minLength={2} maxLength={160} autoComplete="name" />
        </label>
        <CustomSelect
          searchable
          ariaLabel="واحد سازمانی"
          value={departmentId}
          onChange={setDepartment}
          options={[
            { value: "", label: "انتخاب واحد" },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        {!departments.length && (
          <p className="form-alert">
            واحد فعال دارای مدیر تعریف نشده است؛ با فناوری اطلاعات تماس بگیرید.
          </p>
        )}
        <button className="primary-button" disabled={busy || !departmentId}>
          {busy ? "در حال ذخیره…" : "تکمیل مشخصات"}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={logout}>
          خروج
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
    </form>
  );
}
