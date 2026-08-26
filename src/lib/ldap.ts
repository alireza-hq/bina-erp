import { Client, escapeFilter } from "ldapts";

export type DirectoryUser = {
  ldapId: string;
  username: string;
  displayName: string;
  email: string | null;
};
function required(name: "LDAP_URL" | "LDAP_BASE_DN" | "LDAP_DOMAIN") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function attribute(entry: Record<string, unknown>, name: string) {
  const value = entry[name];
  if (Array.isArray(value)) return value[0] ? String(value[0]) : "";
  return value ? String(value) : "";
}
export async function authenticateDirectoryUser(
  inputUsername: string,
  password: string,
): Promise<DirectoryUser> {
  const url = required("LDAP_URL");
  const baseDN = required("LDAP_BASE_DN");
  const domain = required("LDAP_DOMAIN");
  const account = inputUsername.trim().replace(/^.*\\/, "").split("@")[0].toLowerCase();
  const bindIdentity =
    inputUsername.includes("@") || inputUsername.includes("\\")
      ? inputUsername
      : `${account}@${domain}`;
  const client = new Client({
    url,
    timeout: 8000,
    connectTimeout: 5000,
    ...(url.toLowerCase().startsWith("ldaps://")
      ? { tlsOptions: { rejectUnauthorized: true } }
      : {}),
  });
  try {
    await client.bind(bindIdentity, password);
    const result = await client.search(baseDN, {
      scope: "sub",
      filter: escapeFilter`(&(objectCategory=person)(objectClass=user)(sAMAccountName=${account}))`,
      attributes: [
        "distinguishedName",
        "sAMAccountName",
        "displayName",
        "mail",
        "userPrincipalName",
      ],
      sizeLimit: 1,
      timeLimit: 8,
    });
    const entry = result.searchEntries[0] as unknown as Record<string, unknown> | undefined;
    if (!entry) throw new Error("Directory user was authenticated but not found");
    const username = attribute(entry, "sAMAccountName") || account;
    return {
      ldapId: attribute(entry, "distinguishedName") || String(entry.dn || username),
      username: username.toLowerCase(),
      displayName: attribute(entry, "displayName") || username,
      email: attribute(entry, "mail") || attribute(entry, "userPrincipalName") || null,
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
