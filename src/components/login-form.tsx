"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { loginSchema } from "@/lib/validation";

type LoginInput = z.input<typeof loginSchema>;
export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const submit = handleSubmit(async (values) => {
    setServerError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setServerError(result.message || "ورود انجام نشد");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setServerError("ارتباط با سرور برقرار نشد.");
    }
  });
  return (
    <form noValidate onSubmit={submit} className="auth-form">
      <div className="field">
        <label htmlFor="username">نام کاربری</label>
        <div className="input-shell">
          <UserRound size={18} />
          <input id="username" dir="ltr" autoComplete="username" {...register("username")} />
        </div>
        {errors.username && <p className="field-error">{errors.username.message}</p>}
      </div>
      <div className="field">
        <label htmlFor="password">رمز عبور</label>
        <div className="input-shell">
          <LockKeyhole size={18} />
          <input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            {...register("password")}
          />
        </div>
        {errors.password && <p className="field-error">{errors.password.message}</p>}
      </div>
      {serverError && (
        <div className="form-alert" role="alert">
          {serverError}
        </div>
      )}
      <button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
        {isSubmitting ? <span className="spinner" /> : <LogIn size={18} />}
        <span>{isSubmitting ? "در حال بررسی…" : "ورود"}</span>
      </button>
    </form>
  );
}
