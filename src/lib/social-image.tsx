import { ImageResponse } from "next/og";

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
        <div
          style={{
            display: "flex",
            padding: 32,
            color: "#172554",
            fontSize: 48,
            textAlign: "center",
          }}
        >
          Employee Work Reporting System
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
