const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID, randomBytes, createHash, createHmac } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql, eq } = require("drizzle-orm");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());
test("period control and transactional audit on isolated PostgreSQL", async (t) => {
  const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const schema = load("src/db/schema.ts");
  const root = drizzle(client, { schema });
  const scratch = `phase5_${randomUUID().replaceAll("-", "")}`,
    archive = `${scratch}_archive`,
    rollback = new Error("rollback");
  const jar = new Map();
  process.env.JWT_SECRET = "phase5-fixture-secret-at-least-32-characters";
  try {
    await root.transaction(async (tx) => {
      await tx.execute(sql.raw(`CREATE SCHEMA "${scratch}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${scratch}",pg_catalog`));
      for (const entry of JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries) {
        const source = readFileSync(`drizzle/${entry.tag}.sql`, "utf8")
          .replaceAll('"public"', `"${scratch}"`)
          .replaceAll('"legacy_letter_list"', `"${archive}"`);
        for (const stmt of source.split("--> statement-breakpoint"))
          if (stmt.trim()) await tx.execute(sql.raw(stmt));
      }
      const people = {},
        cookies = {};
      for (const [name, role] of [
        ["ali", "EMPLOYEE"],
        ["reza", "EMPLOYEE"],
        ["business", "BUSINESS_ADMIN"],
        ["it", "IT_ADMIN"],
      ]) {
        const [user] = await tx
          .insert(schema.users)
          .values({ ldapId: `CN=${name}`, username: name, displayName: name, role })
          .returning();
        people[name] = user;
        const raw = randomBytes(32).toString("base64url");
        cookies[name] =
          `${raw}.${createHmac("sha256", process.env.JWT_SECRET).update(raw).digest("base64url")}`;
        await tx.insert(schema.sessions).values({
          userId: user.id,
          tokenHash: createHash("sha256").update(raw).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        });
      }
      const [project] = await tx
        .insert(schema.projects)
        .values({ code: "A", name: "Project A" })
        .returning();
      const [file] = await tx
        .insert(schema.projectFiles)
        .values({ projectId: project.id, code: "PID", name: "PID" })
        .returning();
      const model = load("src/lib/period-model.ts");
      const mocks = {
        "@/db": { db: tx },
        "@/db/schema": schema,
        "@/lib/period-model": model,
        "next/headers": { cookies: async () => ({ get: (key) => jar.get(key) }) },
      };
      const auth = load("src/lib/auth.ts", mocks);
      const periods = load("src/lib/reporting-periods.ts", mocks);
      const work = load("src/lib/work-entries.ts", mocks);
      const periodApi = load("src/lib/period-api.ts", {
        ...mocks,
        "@/lib/auth": auth,
        "@/lib/reporting-periods": periods,
      });
      const workApi = load("src/lib/work-api.ts", {
        ...mocks,
        "@/lib/auth": auth,
        "@/lib/work-entries": work,
      });
      const admin = load("src/lib/admin-api.ts", { ...mocks, "@/lib/auth": auth });
      const auditApi = load("src/lib/audit-api.ts", { ...mocks, "@/lib/auth": auth });
      const reports = load("src/lib/business-reports.ts", mocks);
      const { parseBusinessReportQuery } = load("src/lib/business-report-query.ts");
      const date = "2026-01-05",
        week = "2026-01-03";
      const row = (hours) => ({
        projectId: project.id,
        projectFileId: file.id,
        description: "بررسی نقشه",
        manHours: hours,
      });
      const values = (day) =>
        day.entries.map(({ id, projectId, projectFileId, description, manHours }) => ({
          id,
          projectId,
          projectFileId,
          description,
          manHours,
        }));
      const read = (person = "ali", d = date) =>
        work.getOwnWorkEntriesForDate(people[person].id, d);
      const save = (person, day, entries) =>
        work.updateOwnDailyEntries(people[person].id, day.date, { version: day.version, entries });
      function request(actor, method = "POST", body, path = "/api/admin/reporting-periods") {
        jar.clear();
        if (actor) jar.set("bina_session", { value: cookies[actor] });
        return new Request(`http://localhost${path}`, {
          method,
          headers: { origin: "http://localhost", "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      }
      const events = () => tx.select().from(schema.auditLogs);
      let day;
      await t.test("default open, roles, valid week uniqueness and lock idempotency", async () => {
        assert.equal((await periods.getReportingPeriod(date)).status, "OPEN");
        assert.equal((await tx.select().from(schema.reportingPeriods)).length, 0);
        for (const [actor, status] of [
          [null, 401],
          ["ali", 403],
        ])
          assert.equal((await periodApi.periodApi(request(actor), week, "lock")).status, status);
        assert.equal(
          (await periodApi.periodApi(request("business"), "2026-01-04", "lock")).status,
          400,
        );
        const empty = await read();
        day = await save("ali", empty, [row("2"), row("1.5"), row("3")]);
        await save("reza", await read("reza"), [row("4")]);
        assert.equal((await events()).filter((e) => e.action === "WORK_ENTRY_CREATED").length, 4);
        assert.equal((await periodApi.periodApi(request("business"), week, "lock")).status, 200);
        assert.equal((await periodApi.periodApi(request("it"), week, "lock")).status, 200);
        assert.equal((await tx.select().from(schema.reportingPeriods)).length, 1);
        assert.equal((await events()).filter((e) => e.action === "PERIOD_LOCKED").length, 1);
        const locked = await periods.getReportingPeriod(date);
        assert.equal(locked.lockedBy, people.business.id);
        assert.ok(locked.lockedAt);
        for (const input of [
          { weekStart: week, weekEnd: "2026-01-09" },
          { weekStart: "2026-01-04", weekEnd: "2026-01-10" },
          { weekStart: "2026-01-10", weekEnd: "2026-01-15" },
        ])
          await assert.rejects(() =>
            tx.transaction((s) => s.insert(schema.reportingPeriods).values(input)),
          );
      });
      await t.test(
        "locked weeks reject all stale mutations atomically but reports/exports remain exact",
        async () => {
          const beforeCount = (await events()).length;
          for (const entries of [
            [],
            [...values(day), row("1")],
            values(day).map((r) => ({ ...r, manHours: "1" })),
          ]) {
            const response = await workApi.ownDayApi(
              request("ali", "PUT", { version: day.version, entries }),
              date,
            );
            assert.equal(response.status, 423, await response.text());
          }
          await assert.rejects(
            async () => save("ali", await read("ali", "2026-01-06"), [row("1")]),
            /بسته/,
          );
          assert.equal((await read()).totalHours, "6.50");
          assert.equal((await events()).length, beforeCount);
          const q = parseBusinessReportQuery({ from: week, to: "2026-01-09", groupBy: "employee" });
          const report = await reports.getBusinessReport(q);
          assert.equal(report.totalHours, "10.50");
          assert.deepEqual(report.groups.map((g) => g.totalHours).sort(), ["4.00", "6.50"]);
          const exported = await reports.getBusinessReportExport(q, "summary");
          const sheets = await require("read-excel-file/node")(
            await load("src/lib/report-workbook.ts").createReportWorkbook(exported, "summary"),
          );
          assert.equal(sheets[1].data.find((r) => r[0] === "جمع نفر-ساعت منبع")[1], 10.5);
        },
      );
      await t.test(
        "unlock restores owned edits, preserves before/after and no-op suppression",
        async () => {
          for (const actor of ["it", "business"])
            assert.equal((await periodApi.periodApi(request(actor), week, "unlock")).status, 200);
          assert.equal((await events()).filter((e) => e.action === "PERIOD_UNLOCKED").length, 1);
          assert.equal((await read()).period.status, "OPEN");
          const before = await read();
          const rows = values(before);
          const removed = rows.pop();
          rows[0].manHours = "2.25";
          rows[0].description = "اصلاح";
          rows.push(row("0.25"));
          const start = performance.now();
          day = await save("ali", before, rows);
          console.log("Audited multi-row save ms:", Math.round(performance.now() - start));
          const changedReport = await reports.getBusinessReport(
            parseBusinessReportQuery({ from: week, to: "2026-01-09" }),
          );
          assert.equal(Number(changedReport.totalHours), Number(day.totalHours) + 4);
          assert.notEqual(changedReport.totalHours, "10.50");
          const audits = await events();
          const updated = audits.find((e) => e.action === "WORK_ENTRY_UPDATED");
          assert.equal(updated.newData.description, "اصلاح");
          assert.equal(updated.oldData.description, "بررسی نقشه");
          assert.equal(updated.actorUserId, people.ali.id);
          const deleted = audits.find((e) => e.action === "WORK_ENTRY_DELETED");
          assert.equal(deleted.entityId, removed.id);
          assert.equal(deleted.oldData.employeeId, people.ali.id);
          assert.equal(deleted.newData, null);
          assert.ok(!JSON.stringify(audits).includes("tokenHash"));
          assert.ok(!JSON.stringify(audits).includes("ldapId"));
          await save("ali", day, values(day));
          assert.equal((await events()).length, audits.length);
          await save("ali", day, []);
          assert.equal((await read()).entries.length, 0);
          assert.equal((await read("reza")).totalHours, "4.00");
        },
      );
      await t.test("failed business/audit transactions roll back both sides", async () => {
        const count = (await events()).length;
        const empty = await read();
        await assert.rejects(() =>
          save("ali", empty, [row("1"), { ...row("1"), projectFileId: randomUUID() }]),
        );
        assert.equal((await events()).length, count);
        assert.equal((await read()).entries.length, 0);
        await tx.execute(
          sql.raw(
            `CREATE FUNCTION audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit unavailable'; END $$`,
          ),
        );
        await tx.execute(
          sql.raw(
            `CREATE TRIGGER audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_failure()`,
          ),
        );
        await assert.rejects(() => save("ali", empty, [row("1")]));
        assert.equal((await read()).entries.length, 0);
        await assert.rejects(() => periods.changeReportingPeriod(people.it.id, week, "lock"));
        assert.equal((await periods.getReportingPeriod(week)).status, "OPEN");
        const response = await admin.masterItem(
          request("it", "PATCH", { name: "should roll back" }),
          "projects",
          project.id,
        );
        assert.equal(response.status, 500);
        assert.equal(
          (await tx.select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0]
            .name,
          "Project A",
        );
        assert.equal((await events()).length, count);
        await tx.execute(sql.raw("DROP TRIGGER audit_failure ON audit_logs"));
        await tx.execute(sql.raw("DROP FUNCTION audit_failure()"));
        const forced = new Error("force business rollback");
        await assert.rejects(() =>
          tx.transaction(async (sub) => {
            await load("src/lib/work-entries.ts", {
              ...mocks,
              "@/db": { db: sub },
            }).updateOwnDailyEntries(people.ali.id, date, {
              version: empty.version,
              entries: [row("1")],
            });
            throw forced;
          }),
        );
        assert.equal((await events()).length, count);
        assert.equal((await read()).entries.length, 0);
      });
      await t.test("user and all master changes create audit records transactionally", async () => {
        const data = async (response) => {
          const body = await response.json();
          assert.ok(response.ok, JSON.stringify(body));
          return body.data;
        };
        const department = await data(
          await admin.masterCollection(
            request("it", "POST", { name: "Engineering" }),
            "departments",
          ),
        );
        await data(
          await admin.masterItem(
            request("it", "PATCH", { name: "Engineering 2" }),
            "departments",
            department.id,
          ),
        );
        for (const isActive of [false, true])
          await data(
            await admin.masterItem(
              request("it", "PATCH", { isActive }),
              "departments",
              department.id,
            ),
          );
        const p = await data(
          await admin.masterCollection(
            request("it", "POST", { name: "New Project", code: "NEW" }),
            "projects",
          ),
        );
        await data(
          await admin.masterItem(request("it", "PATCH", { name: "Renamed" }), "projects", p.id),
        );
        for (const isActive of [false, true])
          await data(
            await admin.masterItem(request("it", "PATCH", { isActive }), "projects", p.id),
          );
        const f = await data(
          await admin.projectFileCollection(
            request("it", "POST", { name: "Doc", code: "D" }),
            p.id,
          ),
        );
        await data(
          await admin.projectFileItem(request("it", "PATCH", { name: "Doc 2" }), p.id, f.id),
        );
        for (const isActive of [false, true])
          await data(await admin.projectFileItem(request("it", "PATCH", { isActive }), p.id, f.id));
        await data(
          await admin.updateUser(
            request("it", "PATCH", {
              role: "BUSINESS_ADMIN",
              departmentId: department.id,
              employeeCode: "E1",
            }),
            people.reza.id,
          ),
        );
        for (const isActive of [false, true])
          await data(await admin.updateUser(request("it", "PATCH", { isActive }), people.reza.id));
        const actions = new Set((await events()).map((e) => e.action));
        for (const prefix of ["DEPARTMENT", "PROJECT", "PROJECT_FILE"])
          for (const suffix of ["CREATED", "UPDATED", "ACTIVATED", "DEACTIVATED"])
            assert.ok(actions.has(`${prefix}_${suffix}`));
        for (const action of [
          "USER_ROLE_CHANGED",
          "USER_DEPARTMENT_CHANGED",
          "USER_ACTIVATED",
          "USER_DEACTIVATED",
          "USER_UPDATED",
        ])
          assert.ok(actions.has(action));
        const before = (await events()).length;
        await data(
          await admin.masterItem(request("it", "PATCH", { name: "Renamed" }), "projects", p.id),
        );
        assert.equal((await events()).length, before);
      });
      await t.test("audit viewer role, pagination, filters, JSON and foreign keys", async () => {
        for (const [actor, status] of [
          [null, 401],
          ["ali", 403],
          ["business", 403],
          ["it", 200],
        ])
          assert.equal(
            (await auditApi.auditApi(request(actor, "GET", undefined, "/api/admin/audit"))).status,
            status,
          );
        const { parseAuditQuery } = load("src/lib/audit-query.ts");
        const viewer = load("src/lib/audit-viewer.ts", mocks);
        const query = parseAuditQuery({ pageSize: 25 });
        const first = await viewer.getAuditLogs(query),
          second = await viewer.getAuditLogs({ ...query, page: 2 });
        assert.ok(first.count > 25);
        assert.equal(first.rows.length, 25);
        assert.equal(
          new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
          first.rows.length + second.rows.length,
        );
        const filtered = await viewer.getAuditLogs({
          ...query,
          action: "PERIOD_LOCKED",
          entityType: "PERIOD",
          actor: "business",
        });
        assert.equal(filtered.count, 1);
        assert.equal(filtered.rows[0].newData.status, "LOCKED");
        await assert.rejects(() =>
          tx.transaction((s) =>
            s.insert(schema.auditLogs).values({
              actorUserId: randomUUID(),
              action: "PERIOD_LOCKED",
              entityType: "PERIOD",
              entityId: randomUUID(),
            }),
          ),
        );
        await assert.rejects(() =>
          tx.transaction((s) =>
            s.delete(schema.users).where(eq(schema.users.id, people.business.id)),
          ),
        );
        const indexes = await tx.execute(
          sql`select indexname from pg_indexes where schemaname=${scratch} and tablename='audit_logs'`,
        );
        assert.equal(indexes.length, 5);
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await client.end();
  }
});
