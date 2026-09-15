import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { onboardingDepartments } from "@/lib/onboarding";
import { OnboardingForm } from "@/components/onboarding-form";
export const metadata = { title: "تکمیل مشخصات" };
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profileCompletedAt && user.departmentId) redirect("/dashboard");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>تکمیل مشخصات</h1>
        <p>پیش از استفاده از سامانه، نام فارسی و واحد خود را انتخاب کنید.</p>
        <OnboardingForm departments={await onboardingDepartments()} />
      </section>
    </main>
  );
}
