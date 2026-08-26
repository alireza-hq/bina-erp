import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ورود" };
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <Image src="/logo.png" alt="نشان بینا" width={62} height={70} priority />
          <span>بینا</span>
        </div>
        <div className="auth-heading">
          <h1>ورود به سامانه</h1>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
