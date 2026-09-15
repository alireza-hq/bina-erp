const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID, randomBytes, createHash, createHmac } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql, eq } = require("drizzle-orm");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());
test("business reporting PostgreSQL: isolated relational and authorization checks", async (t) => {
  const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const schema = load("src/db/schema.ts");
  const root = drizzle(client, { schema });
  const scratch = `phase3_${randomUUID().replaceAll("-", "")}`,
    archive = `${scratch}_archive`,
    rollback = new Error("rollback");
  const jar = new Map();
  process.env.JWT_SECRET = "phase3-test-secret-at-least-32-characters";
  try {
    await root.transaction(async (tx) => {
      await tx.execute(sql.raw(`CREATE SCHEMA "${scratch}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${scratch}", pg_catalog`));
      for (const entry of JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries) {
        const source = readFileSync(`drizzle/${entry.tag}.sql`, "utf8")
          .replaceAll('"public"', `"${scratch}"`)
          .replaceAll('"legacy_letter_list"', `"${archive}"`)
          .replaceAll('"workflow_archive"', `"${archive}_workflow"`);
        for (const statement of source.split("--> statement-breakpoint"))
          if (statement.trim()) await tx.execute(sql.raw(statement));
      }
      const [engineering, hr] = await tx
        .insert(schema.departments)
        .values([{ name: "Engineering" }, { name: "HR" }])
        .returning();
      const people = {},
        cookies = {};
      for (const [username, role, departmentId] of [
        ["ali", "EMPLOYEE", engineering.id],
        ["reza", "EMPLOYEE", hr.id],
        ["business", "BUSINESS_ADMIN", hr.id],
        ["it", "IT_ADMIN", hr.id],
      ]) {
        const [user] = await tx
          .insert(schema.users)
          .values({
            username,
            ldapId: `CN=${username}`,
            displayName: username === "ali" || username === "reza" ? "Same Name" : username,
            role,
            departmentId,
            profileCompletedAt: new Date(),
          })
          .returning();
        people[username] = user;
        const raw = randomBytes(32).toString("base64url");
        cookies[username] =
          `${raw}.${createHmac("sha256", process.env.JWT_SECRET).update(raw).digest("base64url")}`;
        await tx.insert(schema.sessions).values({
          userId: user.id,
          tokenHash: createHash("sha256").update(raw).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        });
      }
      const [a, b] = await tx
        .insert(schema.projects)
        .values([
          { code: "A", name: "Project A" },
          { code: "B", name: "Project B", isActive: false },
        ])
        .returning();
      const [fa, fb] = await tx
        .insert(schema.reportTypes)
        .values([{ name: "Report A" }, { name: "Report B", isActive: false }])
        .returning();
      const row = (person, project, file, hours, date = "2026-01-03") => ({
        status: "APPROVED",
        employeeId: person.id,
        projectId: project.id,
        reportId: file.id,
        manHours: hours,
        description: "work",
        workDate: date,
      });
      await tx
        .insert(schema.workEntries)
        .values([
          row(people.ali, a, fa, "2"),
          row(people.ali, a, fa, "1.5"),
          row(people.ali, b, fb, "3"),
          row(people.reza, a, fa, "4", "2026-01-09"),
          row(people.reza, a, fa, "9", "2026-01-10"),
          row(people.reza, a, fa, "8", "2026-01-02"),
        ]);
      const mocks = {
        "@/db": { db: tx },
        "@/db/schema": schema,
        "next/headers": { cookies: async () => ({ get: (key) => jar.get(key) }) },
      };
      const auth = load("src/lib/auth.ts", mocks);
      const service = load("src/lib/business-reports.ts", mocks);
      const api = load("src/lib/business-report-api.ts", {
        ...mocks,
        "@/lib/auth": auth,
        "@/lib/business-reports": service,
      });
      const { parseBusinessReportQuery: parse } = load("src/lib/business-report-query.ts");
      const base = { from: "2026-01-03", to: "2026-01-09" };
      await t.test(
        "Phase 6 dashboards: exact weekly totals, ownership and missing-reporter semantics",
        async () => {
          const rollbackDashboard = new Error("rollback dashboard fixtures");
          try {
            await tx.transaction(async (isolated) => {
              await isolated
                .update(schema.users)
                .set({ isActive: false })
                .where(sql`${schema.users.ldapId} LIKE 'pending:%'`);
              const workDates = load("src/lib/work-reporting.ts");
              const dashboard = load("src/lib/dashboards.ts", {
                ...mocks,
                "@/db": { db: isolated },
                "@/lib/work-reporting": { ...workDates, todayInTehran: () => "2026-01-03" },
                "next/navigation": {
                  redirect: (destination) => {
                    throw new Error(`redirect:${destination}`);
                  },
                },
              });
              const [missingAssigned, missingUnassigned] = await isolated
                .insert(schema.users)
                .values([
                  {
                    username: "missing-assigned",
                    ldapId: "CN=missing-assigned",
                    displayName: "Missing assigned",
                    profileCompletedAt: new Date(),
                    role: "EMPLOYEE",
                    departmentId: engineering.id,
                  },
                  {
                    username: "missing-unassigned",
                    ldapId: "CN=missing-unassigned",
                    displayName: "Missing unassigned",
                    profileCompletedAt: new Date(),
                    role: "EMPLOYEE",
                  },
                  {
                    username: "inactive-missing",
                    ldapId: "CN=inactive-missing",
                    displayName: "Inactive",
                    role: "EMPLOYEE",
                    isActive: false,
                  },
                  {
                    username: "admin-missing",
                    ldapId: "CN=admin-missing",
                    displayName: "Admin",
                    role: "BUSINESS_ADMIN",
                  },
                ])
                .returning();
              // Entries outside the selected week do not satisfy reporting for this week.
              await isolated
                .insert(schema.workEntries)
                .values(row(missingAssigned, a, fa, "0.25", "2026-01-02"));
              await isolated
                .update(schema.users)
                .set({ isActive: false })
                .where(eq(schema.users.id, people.reza.id));
              jar.clear();
              await assert.rejects(() => dashboard.getBusinessDashboard(), /redirect:\/login/);
              await assert.rejects(() => dashboard.getEmployeeDashboard(), /redirect:\/login/);
              jar.set("bina_session", { value: cookies.ali });
              await assert.rejects(() => dashboard.getBusinessDashboard(), /redirect:\/dashboard/);
              const own = await dashboard.getEmployeeDashboard();
              assert.equal(own.today, base.from);
              assert.equal(own.week.totalHundredths, 650);
              assert.equal(own.todayReport.totalHundredths, 650);
              assert.equal(own.reportedDays, 1);
              assert.equal(own.week.count, 3);
              for (const actor of ["business", "it"]) {
                jar.set("bina_session", { value: cookies[actor] });
                const start = performance.now();
                const result = await dashboard.getBusinessDashboard();
                assert.equal(result.report.totalHours, "10.50");
                assert.equal(result.report.entryCount, 4);
                assert.deepEqual(result.counts, { reporters: 2, missing: 2, activeProjects: 1 });
                assert.deepEqual(
                  new Set(result.missingPeople.map((p) => p.id)),
                  new Set([missingAssigned.id, missingUnassigned.id]),
                );
                assert.equal(result.report.groups.length, 2); // Inactive historical project retained.
                assert.equal(result.departments.groups.length, 2);
                assert.equal(result.period.status, "OPEN");
                console.log(
                  `Phase 6 dashboard PostgreSQL: ${Math.round(performance.now() - start)}ms`,
                );
              }
              throw rollbackDashboard;
            });
          } catch (error) {
            if (error !== rollbackDashboard) throw error;
          }
        },
      );
      const report = (changes) => service.getBusinessReport(parse({ ...base, ...changes }));
      const workbook = load("src/lib/report-workbook.ts");
      const readWorkbook = require("read-excel-file/node");
      const exportApi = load("src/lib/report-export-api.ts", {
        ...mocks,
        "@/lib/auth": auth,
        "@/lib/business-reports": service,
      });
      async function exported(changes = {}, mode = "details") {
        const query = parse({ ...base, ...changes });
        const result = await service.getBusinessReportExport(query, mode);
        return {
          result,
          sheets: await readWorkbook(await workbook.createReportWorkbook(result, mode)),
        };
      }
      const cents = (value) => {
        const [whole, fraction = ""] = value.split(".");
        return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
      };
      async function call(actor, query = "", options = false) {
        jar.clear();
        if (actor) jar.set("bina_session", { value: cookies[actor] });
        return api.businessReportApi(
          new Request(`http://localhost/api/admin/reports?${query}`),
          options,
        );
      }
      await t.test("real session authorization and strict inputs", async () => {
        assert.equal((await call()).status, 401);
        assert.equal((await call("ali")).status, 403);
        for (const actor of ["business", "it"]) {
          assert.equal((await call(actor)).status, 200);
          assert.equal((await call(actor, "kind=employee", true)).status, 200);
        }
        assert.equal((await call("ali", "kind=employee", true)).status, 403);
        for (const query of [
          "sort=evil",
          "page=1&page=2",
          "employeeId=bad",
          "groupBy=project&groupBySecondary=project",
          "from=2026-01-03",
        ])
          assert.equal((await call("business", query)).status, 400);
      });
      await t.test(
        "inclusive dates, individual and combined filters, no multiplied joins",
        async () => {
          const all = await report();
          assert.equal(all.entryCount, 4);
          assert.equal(cents(all.totalHours), 1050n);
          for (const [filter, count, total] of [
            [{ employeeId: people.ali.id }, 3, 650n],
            [{ departmentId: engineering.id }, 3, 650n],
            [{ projectId: a.id }, 3, 750n],
            [{ reportId: fb.id }, 1, 300n],
            [{ departmentId: engineering.id, projectId: a.id }, 2, 350n],
            [{ employeeId: people.reza.id, departmentId: engineering.id }, 0, 0n],
            [{ projectId: a.id, reportId: fb.id }, 0, 0n],
            [{ from: "2026-01-09", to: "2026-01-09" }, 1, 400n],
          ]) {
            const r = await report(filter);
            assert.equal(r.entryCount, count);
            assert.equal(cents(r.totalHours), total);
          }
        },
      );
      await t.test(
        "all grouping dimensions, stable identities, global Report identities",
        async () => {
          for (const dimension of ["employee", "department", "project", "report", "date"]) {
            const r = await report({ groupBy: dimension });
            assert.equal(
              r.groups.reduce((n, g) => n + cents(g.totalHours), 0n),
              1050n,
            );
            assert.equal(r.groupCount, 2);
          }
          const r = await report({ groupBy: "project" });
          assert.equal(cents(r.groups.find((g) => g.primaryKey === a.id).totalHours), 750n);
          const files = (await report({ groupBy: "report" })).groups;
          assert.notEqual(files[0].primaryKey, files[1].primaryKey);
          assert.notEqual(files[0].primaryLabel, files[1].primaryLabel);
          assert.ok(files.every((g) => g.primaryLabel.includes("Report")));
          const employees = (await report({ groupBy: "employee" })).groups;
          assert.equal(employees.length, 2);
          assert.ok(employees.some((g) => g.primaryLabel.includes("ali")));
        },
      );
      await t.test("two levels reconcile to primary totals and overall total", async () => {
        for (const [groupBy, groupBySecondary] of [
          ["project", "employee"],
          ["department", "project"],
          ["employee", "report"],
        ]) {
          const r = await report({ groupBy, groupBySecondary });
          const primary = new Map();
          for (const g of r.groups) {
            const previous = primary.get(g.primaryKey) || { sum: 0n, total: cents(g.primaryHours) };
            previous.sum += cents(g.totalHours);
            primary.set(g.primaryKey, previous);
          }
          for (const p of primary.values()) assert.equal(p.sum, p.total);
          assert.equal(
            [...primary.values()].reduce((sum, p) => sum + p.total, 0n),
            1050n,
          );
        }
      });
      await t.test("XLSX direct endpoint auth and exact filter/group parity", async () => {
        for (const [actor, status] of [
          [null, 401],
          ["ali", 403],
          ["business", 200],
          ["it", 200],
        ]) {
          jar.clear();
          if (actor) jar.set("bina_session", { value: cookies[actor] });
          const response = await exportApi.reportExportApi(
            new Request(
              "http://localhost/api/admin/reports/export?mode=details&from=2026-01-03&to=2026-01-09",
            ),
          );
          assert.equal(response.status, status);
          if (status === 200) {
            assert.match(
              response.headers.get("content-disposition"),
              /^attachment; filename="work-report-details-/,
            );
            assert.match(response.headers.get("content-type"), /spreadsheetml/);
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            assert.equal(
              (await readWorkbook(Buffer.from(await response.arrayBuffer())))[0].data.length,
              5,
            );
          }
        }
        for (const filters of [
          {},
          { from: "2026-01-09", to: "2026-01-09" },
          { employeeId: people.ali.id },
          { departmentId: engineering.id },
          { projectId: a.id },
          { reportId: fb.id },
          {
            departmentId: engineering.id,
            employeeId: people.ali.id,
            projectId: a.id,
            reportId: fa.id,
          },
          { projectId: a.id, reportId: fb.id },
        ]) {
          const screen = await report(filters),
            out = await exported(filters);
          assert.equal(out.sheets[0].data.length - 1, screen.entryCount);
          assert.equal(
            out.sheets[0].data
              .slice(1)
              .reduce((sum, r) => sum + BigInt(Math.round(r[8] * 100)), 0n),
            cents(screen.totalHours),
          );
          assert.equal(
            out.sheets[1].data.find((r) => r[0] === "جمع نفر-ساعت منبع")[1],
            Number(screen.totalHours),
          );
        }
        for (const [groupBy, groupBySecondary] of [
          ["employee"],
          ["department"],
          ["project"],
          ["report"],
          ["date"],
          ["project", "employee"],
          ["department", "project"],
          ["employee", "report"],
        ]) {
          const filter = { groupBy, groupBySecondary };
          const screen = await report(filter),
            out = await exported(filter, "summary");
          assert.equal(out.sheets[0].data.length - 1, screen.groupCount);
          assert.deepEqual(
            out.sheets[0].data.slice(1).map((r) => r.at(-1)),
            screen.groups.map((g) => Number(g.totalHours)),
          );
          assert.equal(
            out.sheets[0].data
              .slice(1)
              .reduce((sum, r) => sum + BigInt(Math.round(r.at(-1) * 100)), 0n),
            1050n,
          );
          if (groupBy === "report")
            assert.notEqual(out.sheets[0].data[1][0], out.sheets[0].data[2][0]);
        }
      });
      await t.test("historical inactive values and current department semantics", async () => {
        await tx
          .update(schema.users)
          .set({ isActive: false })
          .where(eq(schema.users.id, people.ali.id));
        assert.equal((await report({ employeeId: people.ali.id })).entryCount, 3);
        const options = await service.getReportFilterOptions({ kind: "report" });
        assert.equal(options.options.length, 2);
        assert.ok(options.options.find((o) => o.value === fb.id).label.includes("غیرفعال"));
        assert.deepEqual(
          (await service.getReportFilterOptions({ kind: "report", projectId: a.id })).options.map(
            (o) => o.value,
          ),
          [fa.id, fb.id],
        );
        assert.ok(
          (
            await service.getReportFilterOptions({ kind: "employee", search: "ali" })
          ).options[0].label.includes("غیرفعال"),
        );
        await tx
          .update(schema.users)
          .set({ departmentId: hr.id })
          .where(eq(schema.users.id, people.ali.id));
        assert.equal((await report({ departmentId: engineering.id })).entryCount, 0);
        assert.equal((await report({ departmentId: hr.id })).entryCount, 4);
        const moved = await report({ groupBy: "department" });
        assert.equal(moved.groups.length, 1);
        const history = await exported({ reportId: fb.id });
        assert.equal(history.sheets[0].data[1][3], "HR");
        assert.ok(history.sheets[0].data[1][6].includes("Report B"));
      });
      await t.test(
        "decimal precision and stable detail/group pagination independent of totals",
        async () => {
          const rows = Array.from({ length: 60 }, (_, i) =>
            row(
              people.it,
              a,
              fa,
              ["0.25", "0.50", "1.25"][i % 3],
              `2026-02-${String(Math.floor(i / 3) + 1).padStart(2, "0")}`,
            ),
          );
          await tx.insert(schema.workEntries).values(rows);
          const q = {
            from: "2026-02-01",
            to: "2026-02-28",
            pageSize: 25,
            groupBy: "date",
            groupBySecondary: "employee",
          };
          const pages = await Promise.all([1, 2, 3].map((page) => report({ ...q, page })));
          assert.deepEqual(
            pages.map((p) => p.entries.length),
            [25, 25, 10],
          );
          assert.equal(new Set(pages.flatMap((p) => p.entries.map((e) => e.id))).size, 60);
          for (const r of pages) {
            assert.equal(cents(r.totalHours), 4000n);
            assert.equal(r.entryCount, 60);
          }
          assert.deepEqual(
            (await report({ ...q, page: 1 })).entries.map((r) => r.id),
            pages[0].entries.map((r) => r.id),
          );
          assert.equal((await report({ ...q, page: 4 })).entries.length, 0);
          const allExport = await exported({ ...q, page: 3 });
          assert.equal(allExport.sheets[0].data.length, 61);
          assert.equal(allExport.result.totalHours, "40.00");
          assert.equal(cents((await report({ ...q, pageSize: 100 })).totalHours), 4000n);
          // Distinct groups greater than a page, with exact full primary totals repeated across pages.
          const extra = Array.from({ length: 30 }, (_, i) => ({
            username: `extra${i}`,
            ldapId: `CN=extra${i}`,
            displayName: "Extra",
          }));
          const users = await tx.insert(schema.users).values(extra).returning();
          await tx
            .insert(schema.workEntries)
            .values(users.map((person) => row(person, a, fa, "0.25", "2026-03-01")));
          const grouped = {
            from: "2026-03-01",
            to: "2026-03-01",
            groupBy: "project",
            groupBySecondary: "employee",
            pageSize: 25,
          };
          const g1 = await report(grouped),
            g2 = await report({ ...grouped, groupPage: 2 });
          assert.equal(g1.groupCount, 30);
          assert.equal(g1.groups.length, 25);
          assert.equal(g2.groups.length, 5);
          assert.equal(new Set([...g1.groups, ...g2.groups].map((g) => g.secondaryKey)).size, 30);
          const groupExport = await exported({ ...grouped, groupPage: 2 }, "summary");
          assert.equal(groupExport.sheets[0].data.length, 31);
          assert.equal(groupExport.result.totalHours, "7.50");
          assert.ok([...g1.groups, ...g2.groups].every((g) => cents(g.primaryHours) === 750n));
          const nullGroup = await report({
            ...grouped,
            groupBy: "department",
            groupBySecondary: undefined,
          });
          assert.equal(nullGroup.groups[0].primaryKey, "unassigned");
        },
      );
      await t.test("bounded searchable options and date index query plan", async () => {
        await tx
          .insert(schema.projects)
          .values(
            Array.from({ length: 60 }, (_, i) => ({ name: `Search project ${i}`, code: `S-${i}` })),
          );
        const options = await service.getReportFilterOptions({ kind: "project" });
        assert.equal(options.options.length, 50);
        assert.equal(options.more, true);
        const selected = await service.getReportFilterOptions({
          kind: "project",
          search: "no match",
          selected: b.id,
        });
        assert.equal(selected.options[0].value, b.id);
        const index = await tx.execute(
          sql`SELECT indexname FROM pg_indexes WHERE schemaname=${scratch} AND indexname='work_entries_date_idx'`,
        );
        assert.equal(index.length, 1);
        await tx.execute(sql`ANALYZE work_entries`);
        const plan = await tx.execute(
          sql`EXPLAIN (ANALYZE, FORMAT JSON) SELECT sum(man_hours) FROM work_entries WHERE work_date BETWEEN DATE '2026-01-03' AND DATE '2026-01-09'`,
        );
        assert.ok(plan[0]["QUERY PLAN"][0]["Execution Time"] >= 0);
        console.log(
          "Reporting fixture EXPLAIN execution ms:",
          plan[0]["QUERY PLAN"][0]["Execution Time"],
        );
      });
      await t.test(
        "export performance at 500/3000 rows and hard limit without truncation",
        async () => {
          for (const size of [500, 3000]) {
            const date = size === 500 ? "2026-04-01" : "2026-04-02";
            await tx.execute(
              sql`INSERT INTO work_entries (employee_id,work_date,project_id,report_id,description,man_hours,status) SELECT ${people.it.id}::uuid,${date}::date,${a.id}::uuid,${fa.id}::uuid,'فعالیت آزمایشی',0.25,'APPROVED' FROM generate_series(1,${size})`,
            );
            const query = parse({ ...base, from: date, to: date, pageSize: 25, page: 2 });
            const memory = process.memoryUsage().rss,
              start = performance.now();
            const result = await service.getBusinessReportExport(query, "details"),
              queried = performance.now();
            const buffer = await workbook.createReportWorkbook(result, "details"),
              finished = performance.now();
            const sheets = await readWorkbook(buffer);
            assert.equal(sheets[0].data.length, size + 1);
            assert.equal(Number(result.totalHours), size * 0.25);
            console.log(
              JSON.stringify({
                exportRows: size,
                queryMs: Math.round(queried - start),
                workbookMs: Math.round(finished - queried),
                bytes: buffer.length,
                rssDeltaMiB: Math.round((process.memoryUsage().rss - memory) / 1048576),
              }),
            );
          }
          await tx.execute(
            sql`INSERT INTO work_entries (employee_id,work_date,project_id,report_id,description,man_hours,status) SELECT ${people.it.id}::uuid,DATE '2026-05-01',${a.id}::uuid,${fa.id}::uuid,'limit',0.25,'APPROVED' FROM generate_series(1,20001)`,
          );
          for (const mode of ["details", "summary"])
            await assert.rejects(
              () =>
                service.getBusinessReportExport(
                  parse({ ...base, from: "2026-05-01", to: "2026-05-01" }),
                  mode,
                ),
              /۲۰٬۰۰۰/,
            );
        },
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await client.end();
  }
});
