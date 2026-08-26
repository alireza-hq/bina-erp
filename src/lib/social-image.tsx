/* eslint-disable @next/next/no-img-element */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const logo = await readFile(path.join(process.cwd(), "public", "logo.png"), "base64");
const logoSrc = `data:image/png;base64,${logo}`;
export function createSocialImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #101b3f 0%, #172554 60%, #1e3a5f 100%)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          border: "2px solid rgba(255,255,255,.10)",
          borderRadius: "50%",
          display: "flex",
          boxShadow: "0 0 0 100px rgba(255,255,255,.04), 0 0 0 200px rgba(255,255,255,.025)",
        }}
      />
      <div
        style={{
          width: 330,
          height: 370,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "white",
          borderRadius: 52,
          boxShadow: "0 28px 70px rgba(0,0,0,.25)",
        }}
      >
        <img src={logoSrc} alt="" width={260} height={294} style={{ objectFit: "contain" }} />
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
