import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = localFont({
  src: "../assets/fonts/Vazirmatn/Vazirmatn[wght].woff2",
  variable: "--font-vazirmatn",
  display: "swap",
  weight: "100 900",
});
const description = "ثبت فعالیت‌های روزانه و گزارش‌های سازمانی کارکنان";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: { default: "سامانه گزارش کار کارکنان", template: "%s | سامانه گزارش کار کارکنان" },
  description,
  applicationName: "سامانه گزارش کار کارکنان",
  authors: [{ name: "سامانه گزارش کار کارکنان" }],
  creator: "سامانه گزارش کار کارکنان",
  publisher: "سامانه گزارش کار کارکنان",
  category: "business",
  icons: { icon: "/app-icon.svg" },
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
    siteName: "سامانه گزارش کار کارکنان",
    title: "سامانه گزارش کار کارکنان",
    description,
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: "سامانه گزارش کار کارکنان" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "سامانه گزارش کار کارکنان",
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
