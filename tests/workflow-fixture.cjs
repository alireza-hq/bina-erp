const { readFileSync } = require("node:fs");
const { randomUUID, randomBytes, createHash, createHmac } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());
exports.fixture = async function () {
  const scratch = `workflow_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${scratch}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${scratch}",pg_catalog`);
      for (const e of JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries) {
        const source = readFileSync(`drizzle/${e.tag}.sql`, "utf8")
          .replaceAll('"public"', `"${scratch}"`)
          .replaceAll('"legacy_letter_list"', `"${scratch}_legacy"`)
          .replaceAll('"workflow_archive"', `"${scratch}_archive"`);
        for (const statement of source.split("--> statement-breakpoint"))
          if (statement.trim()) await tx.unsafe(statement);
      }
    });
  } catch (e) {
    await admin.end();
    throw e;
  }
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", `-csearch_path=${scratch},pg_catalog`);
  const client = postgres(url.toString(), {
    max: 5,
    onnotice: () => {},
    connection: { lock_timeout: 5000 },
  });
  const schema = load("src/db/schema.ts");
  const db = drizzle(client, { schema });
  const jar = new Map();
  const secret = randomBytes(48).toString("hex");
  process.env.JWT_SECRET = secret;
  const dates = load("src/lib/work-reporting.ts");
  let today = "2026-09-14";
  const mocks = {
    "@/db": { db },
    "@/db/schema": schema,
    "@/lib/work-reporting": { ...dates, todayInTehran: () => today },
    "next/headers": {
      cookies: async () => ({
        get: (key) => jar.get(key),
        set: (key, value) => jar.set(key, { value }),
        delete: (key) => jar.delete(key),
      }),
    },
    "next/navigation": {
      redirect: (url) => {
        throw Error(`redirect:${url}`);
      },
    },
  };
  const mod = (name) => load(`src/lib/${name}.ts`, mocks);
  const [department] = await db
    .insert(schema.departments)
    .values({ name: "Engineering" })
    .returning();
  const people = {},
    tokens = {};
  for (const [name, role] of [
    ["employee", "EMPLOYEE"],
    ["other", "EMPLOYEE"],
    ["dm", "BUSINESS_ADMIN"],
    ["pm", "EMPLOYEE"],
    ["it", "IT_ADMIN"],
    ["new", "EMPLOYEE"],
  ]) {
    const [user] = await db
      .insert(schema.users)
      .values({
        username: name,
        ldapId: `CN=${name}`,
        displayName: name,
        role,
        departmentId: name === "new" ? null : department.id,
        profileCompletedAt: name === "new" ? null : new Date(),
      })
      .returning();
    people[name] = user;
    const raw = randomBytes(32).toString("base64url");
    tokens[name] = `${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`;
    await db.insert(schema.sessions).values({
      userId: user.id,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    });
  }
  await client`UPDATE departments SET manager_user_id=${people.dm.id} WHERE id=${department.id}`;
  const [project] = await db
    .insert(schema.projects)
    .values({ code: "A", name: "Project A", managerUserId: people.pm.id })
    .returning();
  const [report] = await db.insert(schema.reportTypes).values({ name: "طراحی" }).returning();
  const signIn = (name) => {
    jar.clear();
    if (name) jar.set("bina_session", { value: tokens[name] });
  };
  return {
    url: url.toString(),
    db,
    client,
    schema,
    people,
    department,
    project,
    report,
    mod,
    mocks,
    signIn,
    setToday: (value) => {
      today = value;
    },
    date: today,
    row: (changes = {}) => ({
      projectId: project.id,
      reportId: report.id,
      description: "",
      manHours: "1.25",
      ...changes,
    }),
    async close() {
      await client.end();
      try {
        for (const name of [scratch, `${scratch}_legacy`, `${scratch}_archive`]) {
          if (!/^workflow_[a-f0-9]{32}(_legacy|_archive)?$/.test(name))
            throw Error("Unsafe fixture identifier");
          await admin.unsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
        }
      } finally {
        await admin.end();
      }
    },
  };
};
