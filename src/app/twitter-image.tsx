import { createSocialImage } from "@/lib/social-image";
export const alt = "بینا؛ سامانه مدیریت مکاتبات سازمانی";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function TwitterImage() {
  return createSocialImage();
}
