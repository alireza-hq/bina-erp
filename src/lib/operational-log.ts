// Operational diagnostics are deliberately separate from business audit data.
// Never serialize arbitrary errors: LDAP/SQL messages can contain credentials or business data.
export function operationalLog(event: string, error?: unknown) {
  const value = error as { code?: unknown; cause?: { code?: unknown } } | undefined;
  const raw = value?.code ?? value?.cause?.code;
  const code = typeof raw === "string" && /^[A-Z0-9_]{2,32}$/.test(raw) ? raw : "UNEXPECTED";
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...(error === undefined ? {} : { code }),
    }),
  );
}
