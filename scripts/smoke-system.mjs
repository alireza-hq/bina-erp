import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import nextEnv from "@next/env";
import postgres from "postgres";
import readWorkbook from "read-excel-file/node";

nextEnv.loadEnvConfig(process.cwd());
const root = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: () => {},
});
const schema = `phase1_http_${randomUUID().replaceAll("-", "")}`;
const archive = `${schema}_archive`;
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.searchParams.set("options", `-csearch_path=${schema},pg_catalog`);
const sql = postgres(testUrl.toString(), { max: 1, connect_timeout: 10 });
const base = "http://localhost:3101";
const secret = randomBytes(48).toString("hex");
let server;
let created = false;
try {
  await root.begin(async (tx) => {
    await tx.unsafe(`CREATE SCHEMA "${schema}"`);
    await tx.unsafe(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    for (const entry of JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries) {
      const source = (await readFile(`drizzle/${entry.tag}.sql`, "utf8"))
        .replaceAll('"public"', `"${schema}"`)
        .replaceAll('"legacy_letter_list"', `"${archive}"`);
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
    }
  });
  created = true;
  const cookies = {};
  const ids = {};
  for (const role of ["EMPLOYEE", "BUSINESS_ADMIN", "IT_ADMIN"]) {
    const [user] =
      await sql`insert into users (ldap_id,username,display_name,role) values (${`CN=${role},DC=fixture`}, ${role.toLowerCase()}, ${role}, ${role}) returning id`;
    ids[role] = user.id;
    const raw = randomBytes(32).toString("base64url");
    cookies[role] =
      `bina_session=${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`;
    await sql`insert into sessions (user_id, token_hash, expires_at) values (${user.id}, ${createHash("sha256").update(raw).digest("hex")}, ${new Date(Date.now() + 300000)})`;
  }
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3101", "--hostname", "127.0.0.1"],
    {
      windowsHide: true,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: testUrl.toString(),
        JWT_SECRET: secret,
        NEXT_PUBLIC_APP_URL: base,
      },
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Smoke server failed to start");
    if (output.includes("Ready in")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(output.includes("Ready in"), "Production server startup timed out");
  const request = (path, role, method = "GET", body) =>
    fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(role ? { cookie: cookies[role] } : {}),
        origin: base,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const data = async (response, status = 200) => {
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value.data;
  };
  assert.equal((await request("/login")).status, 200);
  for (const path of [
    "/dashboard",
    "/system/users",
    "/system/departments",
    "/system/projects",
    `/system/projects/${randomUUID()}`,
  ]) {
    const response = await request(path);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/login");
  }
  for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"]) {
    const dashboard = await request("/dashboard", role);
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.text()).includes('href="/system/users"'), false);
    for (const path of ["/system/users", "/system/departments", "/system/projects"])
      assert.equal((await request(path, role)).headers.get("location"), "/dashboard");
  }
  for (const path of ["/api/admin/users", "/api/admin/departments", "/api/admin/projects"]) {
    assert.equal((await request(path)).status, 401);
    for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"])
      assert.equal((await request(path, role)).status, 403);
    assert.equal((await request(path, "IT_ADMIN")).status, 200);
  }
  for (const path of ["/system/users", "/system/departments", "/system/projects"])
    assert.equal((await request(path, "IT_ADMIN")).status, 200);
  const department = await data(
    await request("/api/admin/departments", "IT_ADMIN", "POST", {
      name: "واحد مهندسی",
      code: "ENG",
    }),
    201,
  );
  const project = await data(
    await request("/api/admin/projects", "IT_ADMIN", "POST", {
      name: "پروژه آزمایشی",
      code: "P-001",
    }),
    201,
  );
  const file = await data(
    await request(`/api/admin/projects/${project.id}/files`, "IT_ADMIN", "POST", {
      name: "نقشه فرایند",
      code: "PID-001",
    }),
    201,
  );
  assert.equal((await request(`/system/projects/${project.id}`, "IT_ADMIN")).status, 200);
  // Employee work flow, including simultaneous duplicate saves through real HTTP requests.
  const reportDate = "2026-01-05";
  const reportPath = `/api/work-entries/${reportDate}`;
  for (const path of ["/reports", `/reports/${reportDate}`, "/reports/new"]) {
    assert.equal((await request(path)).headers.get("location"), "/login");
  }
  assert.equal((await request(reportPath)).status, 401);
  assert.equal((await request("/reports?week=2026-01-05", "EMPLOYEE")).status, 200);
  assert.equal((await request(`/reports/${reportDate}`, "EMPLOYEE")).status, 200);
  const emptyDay = await data(await request(reportPath, "EMPLOYEE"));
  const workRows = ["2", "1.5", "3"].map((manHours) => ({
    projectId: project.id,
    projectFileId: file.id,
    description: "بررسی مدرک",
    manHours,
  }));
  const duplicate = await Promise.all(
    [1, 2].map(() =>
      request(reportPath, "EMPLOYEE", "PUT", { version: emptyDay.version, entries: workRows }),
    ),
  );
  assert.deepEqual(duplicate.map((response) => response.status).sort(), [200, 409]);
  let savedDay = await data(await request(reportPath, "EMPLOYEE"));
  assert.equal(savedDay.totalHours, "6.50");
  assert.equal(savedDay.entries.length, 3);
  const companyQuery = `from=2026-01-03&to=2026-01-09&groupBy=project&groupBySecondary=employee`;
  const exportPath = `/api/admin/reports/export?${companyQuery}&mode=details&page=5&pageSize=25`;
  assert.equal((await request(exportPath)).status, 401);
  assert.equal((await request(exportPath, "EMPLOYEE")).status, 403);
  for (const role of ["BUSINESS_ADMIN", "IT_ADMIN"]) {
    const response = await request(exportPath, role);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-disposition"),
      /^attachment; filename="work-report-details-/,
    );
    const sheets = await readWorkbook(Buffer.from(await response.arrayBuffer()));
    assert.equal(sheets[0].data.length, 4);
    assert.equal(sheets[1].data.find((row) => row[0] === "جمع نفر-ساعت منبع")[1], 6.5);
    const summary = await request(
      `/api/admin/reports/export?${companyQuery}&mode=summary&groupPage=7`,
      role,
    );
    assert.equal(summary.status, 200);
    const grouped = await readWorkbook(Buffer.from(await summary.arrayBuffer()));
    assert.equal(grouped[0].data.length, 2);
    assert.equal(grouped[0].data[1].at(-1), 6.5);
  }
  assert.equal(
    (await request("/api/admin/reports/export?mode=details&sort=unsafe", "BUSINESS_ADMIN")).status,
    400,
  );
  assert.equal(
    (await request("/api/admin/reports/export?mode=details&mode=summary", "BUSINESS_ADMIN")).status,
    400,
  );
  assert.equal((await request(exportPath, "IT_ADMIN", "POST", {})).status, 405);
  assert.equal((await request("/admin/reports")).headers.get("location"), "/login");
  assert.equal((await request("/admin/reports", "EMPLOYEE")).headers.get("location"), "/dashboard");
  for (const path of ["/api/admin/reports", "/api/admin/reports/options?kind=employee"]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, "EMPLOYEE")).status, 403);
    for (const role of ["BUSINESS_ADMIN", "IT_ADMIN"])
      assert.equal((await request(path, role)).status, 200);
  }
  for (const role of ["BUSINESS_ADMIN", "IT_ADMIN"]) {
    const company = await data(await request(`/api/admin/reports?${companyQuery}`, role));
    assert.equal(company.totalHours, "6.50");
    assert.equal(company.entryCount, 3);
    assert.equal(company.groups[0].primaryHours, "6.50");
    const page = await request(`/admin/reports?${companyQuery}`, role);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("گزارش‌های سازمان"));
    const dashboard = await request("/dashboard", role);
    assert.ok((await dashboard.text()).includes('href="/admin/reports"'));
  }
  assert.equal((await request("/api/admin/reports?sort=unsafe", "BUSINESS_ADMIN")).status, 400);
  assert.equal((await request("/api/admin/reports", "BUSINESS_ADMIN", "POST", {})).status, 405);
  assert.equal((await request("/api/admin/users", "BUSINESS_ADMIN")).status, 403);
  assert.equal(
    (await (await request("/dashboard", "EMPLOYEE")).text()).includes('href="/admin/reports"'),
    false,
  );
  const weekData = await data(await request(`/api/work-entries?week=${reportDate}`, "EMPLOYEE"));
  assert.equal(weekData.totalHundredths, 650);
  const periodPath = "/api/admin/reporting-periods/2026-01-03";
  assert.equal((await request(`${periodPath}/lock`, undefined, "POST")).status, 401);
  assert.equal((await request(`${periodPath}/lock`, "EMPLOYEE", "POST")).status, 403);
  const savedValues = () =>
    savedDay.entries.map(({ id, projectId, projectFileId, description, manHours }) => ({
      id,
      projectId,
      projectFileId,
      description,
      manHours,
    }));
  // Actual simultaneous requests: a save may finish before the lock, never after it bypassing the check.
  const race = await Promise.all([
    request(`${periodPath}/lock`, "BUSINESS_ADMIN", "POST"),
    request(reportPath, "EMPLOYEE", "PUT", { version: savedDay.version, entries: savedValues() }),
  ]);
  assert.equal(race[0].status, 200);
  assert.ok([200, 423].includes(race[1].status));
  await data(await request(`${periodPath}/lock`, "IT_ADMIN", "POST"));
  const [lockCount] =
    await sql`select count(*)::int as count from audit_logs where action='PERIOD_LOCKED'`;
  assert.equal(lockCount.count, 1);
  for (const entries of [
    [],
    [...savedValues(), workRows[0]],
    savedValues().map((row) => ({ ...row, manHours: "1" })),
  ])
    assert.equal(
      (await request(reportPath, "EMPLOYEE", "PUT", { version: savedDay.version, entries })).status,
      423,
    );
  const lockedPage = await request(`/reports/${reportDate}`, "EMPLOYEE");
  assert.equal(lockedPage.status, 200);
  assert.ok((await lockedPage.text()).includes("توسط مدیریت بسته شده"));
  assert.equal(
    (await data(await request(`/api/admin/reports?${companyQuery}`, "BUSINESS_ADMIN"))).totalHours,
    "6.50",
  );
  const lockedExport = await request(exportPath, "BUSINESS_ADMIN");
  assert.equal(lockedExport.status, 200);
  assert.equal(
    (await readWorkbook(Buffer.from(await lockedExport.arrayBuffer())))[1].data.find(
      (row) => row[0] === "جمع نفر-ساعت منبع",
    )[1],
    6.5,
  );
  const management = await request(`/admin/reports?${companyQuery}`, "BUSINESS_ADMIN");
  assert.ok((await management.text()).includes("باز کردن هفته"));
  const custom = await request("/admin/reports?from=2026-01-04&to=2026-01-05", "BUSINESS_ADMIN");
  assert.ok(!(await custom.text()).includes("قفل کردن هفته"));
  for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"]) {
    assert.equal((await request("/api/admin/audit", role)).status, 403);
    assert.equal((await request("/system/audit", role)).headers.get("location"), "/dashboard");
  }
  assert.equal((await request("/api/admin/audit")).status, 401);
  assert.equal((await request("/system/audit")).headers.get("location"), "/login");
  assert.equal((await request("/system/audit", "IT_ADMIN")).status, 200);
  assert.equal((await request("/api/admin/audit", "IT_ADMIN", "DELETE")).status, 405);
  const audit = await data(await request("/api/admin/audit?action=PERIOD_LOCKED", "IT_ADMIN"));
  assert.equal(audit.count, 1);
  await data(await request(`${periodPath}/unlock`, "IT_ADMIN", "POST"));
  await data(await request(`${periodPath}/unlock`, "BUSINESS_ADMIN", "POST"));
  const [unlockCount] =
    await sql`select count(*)::int as count from audit_logs where action='PERIOD_UNLOCKED'`;
  assert.equal(unlockCount.count, 1);
  savedDay = await data(
    await request(reportPath, "EMPLOYEE", "PUT", {
      version: savedDay.version,
      entries: savedValues().map((row) => ({ ...row, description: "اصلاح پس از باز شدن" })),
    }),
  );
  assert.equal(savedDay.totalHours, "6.50");
  const otherDay = await data(await request(reportPath, "BUSINESS_ADMIN"));
  assert.equal(otherDay.entries.length, 0);
  const first = savedDay.entries[0];
  assert.equal(
    (
      await request(reportPath, "BUSINESS_ADMIN", "PUT", {
        version: otherDay.version,
        entries: [{ id: first.id, ...workRows[0] }],
      })
    ).status,
    404,
  );
  assert.equal((await request(`${reportPath}?employeeId=${ids.EMPLOYEE}`, "IT_ADMIN")).status, 400);
  assert.equal((await request(reportPath, "EMPLOYEE", "DELETE")).status, 405);
  const reduced = savedDay.entries
    .slice(0, 2)
    .map(({ id, projectId, projectFileId, description, manHours }) => ({
      id,
      projectId,
      projectFileId,
      description,
      manHours,
    }));
  savedDay = await data(
    await request(reportPath, "EMPLOYEE", "PUT", { version: savedDay.version, entries: reduced }),
  );
  assert.equal(savedDay.entries.length, 2);
  const assigned = await data(
    await request(`/api/admin/users/${ids.EMPLOYEE}`, "IT_ADMIN", "PATCH", {
      role: "BUSINESS_ADMIN",
      departmentId: department.id,
    }),
  );
  assert.equal(assigned.role, "BUSINESS_ADMIN");
  assert.equal(assigned.departmentId, department.id);
  const off = await data(
    await request(`/api/admin/projects/${project.id}/files/${file.id}`, "IT_ADMIN", "PATCH", {
      isActive: false,
    }),
  );
  assert.equal(off.isActive, false);
  const historical = await data(await request(reportPath, "EMPLOYEE"));
  assert.equal(historical.entries[0].fileActive, false);
  assert.equal((await request(`/reports/${reportDate}`, "EMPLOYEE")).status, 200);
  const options = await data(
    await request(`/api/work-entry-options?projectId=${project.id}`, "EMPLOYEE"),
  );
  assert.equal(options.length, 0);
  assert.equal(
    (await request(`/api/admin/projects/${project.id}`, "IT_ADMIN", "DELETE")).status,
    405,
  );
  await data(
    await request(`/api/admin/users/${ids.EMPLOYEE}`, "IT_ADMIN", "PATCH", { isActive: false }),
  );
  assert.equal((await request("/dashboard", "EMPLOYEE")).headers.get("location"), "/login");
  assert.equal((await request(reportPath, "EMPLOYEE")).status, 401);
  assert.equal((await request("/api/auth/logout", "IT_ADMIN", "POST", {})).status, 200);
  assert.equal((await request("/dashboard", "IT_ADMIN")).headers.get("location"), "/login");
  console.log(
    "Production HTTP: administration, company reporting, XLSX exports, own work reports, decimal totals, concurrent saves, ownership, historical references, deactivation and logout PASS",
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  await sql.end();
  // Only the random schemas created by this invocation can be removed.
  if (created && /^phase1_http_[a-f0-9]{32}$/.test(schema) && archive === `${schema}_archive`) {
    await root.begin(async (tx) => {
      await tx.unsafe(`DROP SCHEMA "${archive}" CASCADE`);
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  }
  await root.end();
}
