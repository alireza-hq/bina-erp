import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = localFont({
  src: "../assets/fonts/Vazirmatn/Vazirmatn[wght].woff2",
  variable: "--font-vazirmatn",
  display: "swap",
  weight: "100 900",
});
const description = "سامانه امن مدیریت پروژه‌ها، دسترسی کاربران و مکاتبات سازمانی";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "بینا | مدیریت مکاتبات", template: "%s | بینا" },
  description,
  applicationName: "بینا",
  keywords: ["بینا", "مدیریت مکاتبات", "مدیریت نامه", "نامه سازمانی", "مدیریت پروژه"],
  authors: [{ name: "بینا" }],
  creator: "بینا",
  publisher: "بینا",
  category: "business",
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: "بینا",
    title: "بینا | مدیریت مکاتبات",
    description,
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: "بینا؛ سامانه مدیریت مکاتبات" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "بینا | مدیریت مکاتبات",
    description,
    images: ["/twitter-image"],
  },
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl">
      <body className={vazirmatn.variable}>{children}</body>
    </html>
  );
}
