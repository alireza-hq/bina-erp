/* eslint-disable @next/next/no-img-element */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
const logo = `data:image/png;base64,${await readFile(path.join(process.cwd(), "public", "logo.png"), "base64")}`;
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "white",
      }}
    >
      <img src={logo} alt="" width={424} height={480} style={{ objectFit: "contain" }} />
    </div>,
    size,
  );
}
