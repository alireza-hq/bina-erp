const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./workflow-fixture.cjs");
const { load } = require("./helpers.cjs");
test("automatic Tehran periods, audit authorization and status-aware official reporting", async (t) => {
  const f = await fixture();
  const { client: sql, people: p, project, report, department: d } = f;
  try {
    await t.test("Tehran Friday/Saturday boundary, no mutable period table", async () => {
      const dates = load("src/lib/work-reporting.ts");
      assert.equal(dates.todayInTehran(new Date("2026-09-18T20:29:59Z")), "2026-09-18");
      assert.equal(dates.todayInTehran(new Date("2026-09-18T20:30:00Z")), "2026-09-19");
      const periods = f.mod("reporting-periods");
      f.setToday("2026-09-18");
      assert.equal((await periods.getReportingPeriod("2026-09-12")).status, "OPEN");
      f.setToday("2026-09-19");
      assert.equal((await periods.getReportingPeriod("2026-09-12")).status, "LOCKED");
      assert.equal((await periods.getReportingPeriod("2026-09-19")).status, "OPEN");
      const [row] =
        await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='reporting_periods'`;
      assert.equal(row.n, 0);
    });
    await t.test(
      "all four states filter/group/export exactly; default totals include approved only",
      async () => {
        for (const [status, hours] of [
          ["APPROVED", "1.25"],
          ["PENDING_DEPARTMENT_APPROVAL", "2.50"],
          ["PENDING_PROJECT_APPROVAL", "3.75"],
          ["REJECTED", "4.25"],
        ])
          await sql`INSERT INTO work_entries(employee_id,department_id,work_date,project_id,report_id,status,description,man_hours) VALUES (${p.employee.id},${d.id},'2026-09-14',${project.id},${report.id},${status},'',${hours})`;
        const service = f.mod("business-reports"),
          parse = load("src/lib/business-report-query.ts").parseBusinessReportQuery;
        const base = { from: "2026-09-12", to: "2026-09-18", groupBy: "report" };
        assert.equal((await service.getBusinessReport(parse(base))).totalHours, "1.25");
        for (const [status, hours] of [
          ["APPROVED", "1.25"],
          ["PENDING_DEPARTMENT_APPROVAL", "2.50"],
          ["PENDING_PROJECT_APPROVAL", "3.75"],
          ["REJECTED", "4.25"],
          ["ALL", "11.75"],
        ]) {
          const q = parse({ ...base, status });
          const result = await service.getBusinessReport(q),
            out = await service.getBusinessReportExport(q, "details");
          assert.equal(result.totalHours, hours);
          assert.equal(out.totalHours, hours);
          assert.equal(result.groups[0].totalHours, hours);
          const workbook = await require("read-excel-file/node")(
            await load("src/lib/report-workbook.ts").createReportWorkbook(out, "details"),
          );
          assert.equal(workbook[0].data.length, result.entryCount + 1);
          assert.ok(workbook[0].data[0].includes("گزارش"));
          assert.ok(workbook[0].data[0].includes("وضعیت تأیید"));
          assert.ok(!workbook[0].data[0].includes("کد پرسنلی"));
        }
      },
    );
    await t.test("audit viewer is IT-only and manager/master mutations are recorded", async () => {
      const auth = f.mod("auth"),
        admin = f.mod("admin-api");
      const req = (method, body) =>
        new Request("http://localhost:3000/api/admin/test", {
          method,
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      for (const who of [null, "employee", "dm", "pm"]) {
        f.signIn(who);
        const result = await auth.requireApiRole(req("GET"), "IT_ADMIN");
        assert.equal(result.error.status, who ? 403 : 401);
      }
      f.signIn("it");
      assert.equal((await auth.requireApiRole(req("GET"), "IT_ADMIN")).user.id, p.it.id);
      assert.equal(
        (await admin.masterItem(req("PATCH", { managerUserId: p.it.id }), "projects", project.id))
          .status,
        200,
      );
      assert.equal(
        (await admin.masterItem(req("PATCH", { managerUserId: p.it.id }), "departments", d.id))
          .status,
        200,
      );
      const created = await admin.masterCollection(req("POST", { name: "بررسی" }), "reports");
      assert.equal(created.status, 201);
      const r = (await created.json()).data;
      for (const body of [{ name: "بررسی مدارک" }, { isActive: false }, { isActive: true }])
        assert.equal((await admin.masterItem(req("PATCH", body), "reports", r.id)).status, 200);
      const actions = (await sql`SELECT action FROM audit_logs`).map((r) => r.action);
      for (const a of [
        "PROJECT_MANAGER_CHANGED",
        "DEPARTMENT_MANAGER_CHANGED",
        "REPORT_CREATED",
        "REPORT_UPDATED",
        "REPORT_DEACTIVATED",
        "REPORT_ACTIVATED",
      ])
        assert.ok(actions.includes(a), a);
      const audit = f.mod("audit-viewer");
      const q = load("src/lib/audit-query.ts").parseAuditQuery({});
      const result = await audit.getAuditLogs(q);
      assert.ok(result.count >= 6);
      assert.ok(result.rows.length <= q.pageSize);
    });
  } finally {
    await f.close();
  }
});
