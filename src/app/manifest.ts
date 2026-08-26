import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "بینا | مدیریت مکاتبات",
    short_name: "بینا",
    description: "سامانه امن مدیریت پروژه‌ها، دسترسی کاربران و مکاتبات سازمانی",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#172554",
    lang: "fa",
    dir: "rtl",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
