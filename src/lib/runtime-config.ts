export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const invalid = new Set<string>();
  for (const name of ["DATABASE_URL", "LDAP_URL", "LDAP_BASE_DN", "LDAP_DOMAIN", "JWT_SECRET"])
    if (!env[name]?.trim()) invalid.add(name);
  const url = (name: string, protocols: string[]) => {
    try {
      const value = new URL(env[name] || "");
      if (!protocols.includes(value.protocol) || !value.hostname) throw new Error();
      return value;
    } catch {
      invalid.add(name);
      return null;
    }
  };
  url("DATABASE_URL", ["postgres:", "postgresql:"]);
  const ldap = url("LDAP_URL", ["ldap:", "ldaps:"]);
  if (ldap?.username || ldap?.password) invalid.add("LDAP_URL");
  if ((env.JWT_SECRET?.length ?? 0) < 32 || env.JWT_SECRET?.startsWith("replace-"))
    invalid.add("JWT_SECRET");
  for (const flag of ["ALLOW_INSECURE_HTTP", "ALLOW_INSECURE_LDAP", "TRUST_PROXY"])
    if (env[flag] !== undefined && !["true", "false"].includes(env[flag]!)) invalid.add(flag);
  const origin = env.APP_ORIGIN || env.NEXT_PUBLIC_APP_URL;
  if (env.NODE_ENV === "production" || origin) {
    try {
      const value = new URL(origin || "");
      if (
        !["https:", "http:"].includes(value.protocol) ||
        value.username ||
        value.password ||
        value.search ||
        value.hash ||
        value.pathname !== "/"
      )
        throw new Error();
      if (
        env.NODE_ENV === "production" &&
        value.protocol !== "https:" &&
        env.ALLOW_INSECURE_HTTP !== "true"
      )
        throw new Error();
    } catch {
      invalid.add("APP_ORIGIN");
    }
  }
  if (
    env.NODE_ENV === "production" &&
    ldap?.protocol === "ldap:" &&
    env.ALLOW_INSECURE_LDAP !== "true"
  )
    invalid.add("LDAP_URL (LDAPS required)");
  if (
    env.DB_POOL_MAX &&
    (!/^\d+$/.test(env.DB_POOL_MAX) || Number(env.DB_POOL_MAX) < 1 || Number(env.DB_POOL_MAX) > 50)
  )
    invalid.add("DB_POOL_MAX");
  if (invalid.size) throw new Error(`Invalid runtime configuration: ${[...invalid].join(", ")}`);
}

export function publicOrigin(env: NodeJS.ProcessEnv = process.env) {
  // Read the server environment object, avoiding NEXT_PUBLIC build-time substitution.
  return env.APP_ORIGIN || env.NEXT_PUBLIC_APP_URL;
}
export function secureSessionCookie() {
  return process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_HTTP !== "true";
}
