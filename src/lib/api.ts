import { ZodError, type ZodType } from "zod";

export function jsonError(message: string, status = 400) {
  return Response.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      return { error: jsonError("درخواست باید JSON باشد", 415) } as const;
    const reader = request.body?.getReader();
    if (!reader) return { error: jsonError("درخواست خالی است") } as const;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return { error: jsonError("حجم درخواست بیش از حد مجاز است", 413) } as const;
      }
      chunks.push(value);
    }
    return { data: schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))) } as const;
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "درخواست نامعتبر است";
    return { error: jsonError(message || "درخواست نامعتبر است") } as const;
  }
}
