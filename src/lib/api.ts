import { ZodError, type ZodType } from "zod";

export function jsonError(message: string, status = 400) {
  return Response.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    return { data: schema.parse(await request.json()) } as const;
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "درخواست نامعتبر است";
    return { error: jsonError(message || "درخواست نامعتبر است") } as const;
  }
}
