import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سامانه گزارش کار کارکنان",
    short_name: "سامانه گزارش کار کارکنان",
    description: "زیرساخت داخلی سامانه گزارش کار کارکنان",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#172554",
    lang: "fa",
    dir: "rtl",
    icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
