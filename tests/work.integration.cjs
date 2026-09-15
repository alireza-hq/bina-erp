const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { fixture } = require("./workflow-fixture.cjs");
const { load } = require("./helpers.cjs");
test("employee workflow, ownership, profile and two-stage decisions on PostgreSQL", async (t) => {
  const f = await fixture();
  const { people: p, client: sql, department: d, project, report } = f;
  const work = f.mod("work-entries"),
    approvals = f.mod("approvals"),
    profile = f.mod("onboarding"),
    auth = f.mod("auth");
  const day = () => work.getOwnWorkEntriesForDate(p.employee.id, f.date);
  const save = async (rows) => {
    const current = await day();
    return work.updateOwnDailyEntries(p.employee.id, f.date, {
      version: current.version,
      entries: rows,
    });
  };
  const input = (row) => ({
    id: row.id,
    projectId: row.projectId,
    reportId: row.reportId,
    manHours: row.manHours,
    description: row.description,
  });
  const request = (method = "GET", body) =>
    new Request("http://localhost:3000/api/approvals", {
      method,
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    await t.test(
      "new users cannot bypass onboarding; inactive/unmanaged departments rejected; Persian profile is local",
      async () => {
        f.signIn();
        assert.equal((await auth.requireApiRole(request(), "EMPLOYEE")).error.status, 401);
        f.signIn("it");
        await sql`UPDATE users SET department_id=${d.id} WHERE id=${p.new.id}`;
        const roleOnly = await f
          .mod("admin-api")
          .updateUser(request("PATCH", { role: "EMPLOYEE" }), p.new.id);
        assert.equal(roleOnly.status, 200);
        assert.equal(
          (await sql`SELECT profile_completed_at FROM users WHERE id=${p.new.id}`)[0]
            .profile_completed_at,
          null,
        );
        f.signIn("new");
        await assert.rejects(auth.requireUser(), /onboarding/);
        assert.equal((await auth.requireApiRole(request(), "EMPLOYEE")).error.status, 428);
        await assert.rejects(
          profile.completeProfile(p.new.id, { displayName: " ", departmentId: d.id }),
        );
        await assert.rejects(profile.completeProfile(p.new.id, { displayName: "علی رضایی" }));
        await sql`UPDATE departments SET is_active=false WHERE id=${d.id}`;
        await assert.rejects(
          profile.completeProfile(p.new.id, { displayName: "علی رضایی", departmentId: d.id }),
        );
        await sql`UPDATE departments SET is_active=true WHERE id=${d.id}`;
        await profile.completeProfile(p.new.id, { displayName: " علی رضایی ", departmentId: d.id });
        assert.equal((await auth.requireUser()).displayName, "علی رضایی");
        const synced = await auth.syncDirectoryUser({
          ldapId: p.new.ldapId,
          username: p.new.username,
          displayName: "LDAP English Name",
        });
        assert.equal(synced.displayName, "علی رضایی");
        await assert.rejects(
          profile.completeProfile(p.new.id, { displayName: "نام دیگر", departmentId: d.id }),
          (e) => e.status === 409,
        );
      },
    );
    await t.test(
      "invalid relationships, inactive values, missing managers and oversized payloads reject atomically",
      async () => {
        for (const row of [
          f.row({ projectId: randomUUID() }),
          f.row({ reportId: randomUUID() }),
          f.row({ manHours: "0" }),
          f.row({ manHours: "-1" }),
          f.row({ description: "a".repeat(2001) }),
        ])
          await assert.rejects(save([f.row(), row]));
        assert.equal((await day()).entries.length, 0);
        for (const table of ["projects", "report_types"]) {
          const id = table === "projects" ? project.id : report.id;
          await sql.unsafe(`UPDATE ${table} SET is_active=false WHERE id=$1`, [id]);
          await assert.rejects(save([f.row()]));
          await sql.unsafe(`UPDATE ${table} SET is_active=true WHERE id=$1`, [id]);
        }
        await sql`UPDATE departments SET manager_user_id=null WHERE id=${d.id}`;
        await assert.rejects(save([f.row()]));
        await sql`UPDATE departments SET manager_user_id=${p.dm.id} WHERE id=${d.id}`;
        await sql`UPDATE projects SET manager_user_id=null WHERE id=${project.id}`;
        await assert.rejects(save([f.row()]));
        await sql`UPDATE projects SET manager_user_id=${p.pm.id} WHERE id=${project.id}`;
        await assert.rejects(save(Array.from({ length: 51 }, () => f.row({ manHours: "0.01" }))));
        const empty = await day();
        await assert.rejects(
          work.updateOwnDailyEntries(p.employee.id, f.date, {
            version: empty.version,
            employeeId: p.other.id,
            entries: [f.row()],
          }),
        );
      },
    );
    let entries;
    await t.test(
      "atomic multi-row submit, exact total, no impersonation/read/update/delete IDOR",
      async () => {
        const saved = await save([f.row({ manHours: "0.25" }), f.row({ manHours: "1.5" })]);
        entries = saved.entries;
        assert.equal(saved.totalHours, "1.75");
        assert.ok(entries.every((e) => e.status === "PENDING_DEPARTMENT_APPROVAL"));
        assert.equal((await work.getOwnWorkEntriesForDate(p.other.id, f.date)).entries.length, 0);
        const other = await work.getOwnWorkEntriesForDate(p.other.id, f.date);
        await assert.rejects(
          work.updateOwnDailyEntries(p.other.id, f.date, {
            version: other.version,
            entries: [input(entries[0])],
          }),
          (e) => e.status === 404,
        );
        await assert.rejects(save([]), (e) => e.status === 409);
        await assert.rejects(
          save(entries.map((e, i) => input({ ...e, description: i ? e.description : "tampered" }))),
          (e) => e.status === 409,
        );
        assert.equal(
          (
            await sql`SELECT count(*)::int AS n FROM audit_logs WHERE action='WORK_ENTRY_SUBMITTED'`
          )[0].n,
          2,
        );
      },
    );
    await t.test(
      "relationship authorization: business/IT roles do not grant approval rights; sequential approvals",
      async () => {
        const id = entries[0].id;
        assert.equal((await approvals.getApprovals(p.dm.id, {})).count, 2);
        assert.equal((await approvals.getApprovals(p.pm.id, {})).count, 0);
        assert.equal((await approvals.getApprovals(p.it.id, {})).count, 0);
        await assert.rejects(
          approvals.decideWorkEntry(p.it.id, id, { stage: "DEPARTMENT", decision: "APPROVED" }),
          (e) => e.status === 403,
        );
        await assert.rejects(
          approvals.decideWorkEntry(p.pm.id, id, { stage: "PROJECT", decision: "APPROVED" }),
          (e) => e.status === 409,
        );
        await approvals.decideWorkEntry(p.dm.id, id, { stage: "DEPARTMENT", decision: "APPROVED" });
        assert.equal((await approvals.getApprovals(p.pm.id, {})).count, 1);
        await assert.rejects(
          approvals.decideWorkEntry(p.dm.id, id, { stage: "PROJECT", decision: "APPROVED" }),
          (e) => e.status === 403,
        );
        await approvals.decideWorkEntry(p.pm.id, id, { stage: "PROJECT", decision: "APPROVED" });
        assert.equal((await day()).entries.find((e) => e.id === id).status, "APPROVED");
        await assert.rejects(
          save((await day()).entries.map((e) => input({ ...e, description: "tampered" }))),
          (e) => e.status === 409,
        );
      },
    );
    await t.test(
      "department/project rejection, mandatory reason, resubmit preserves decision snapshots",
      async () => {
        const id = entries[1].id;
        await assert.rejects(
          approvals.decideWorkEntry(p.dm.id, id, { stage: "DEPARTMENT", decision: "REJECTED" }),
        );
        await approvals.decideWorkEntry(p.dm.id, id, {
          stage: "DEPARTMENT",
          decision: "REJECTED",
          rejectionReason: "اصلاح ساعت",
        });
        const current = await day();
        assert.equal(
          current.history.find((h) => h.workEntryId === id).rejectionReason,
          "اصلاح ساعت",
        );
        await save(
          current.entries.map((e) =>
            input(e.id === id ? { ...e, manHours: "2", description: "اصلاح" } : e),
          ),
        );
        await approvals.decideWorkEntry(p.dm.id, id, { stage: "DEPARTMENT", decision: "APPROVED" });
        await approvals.decideWorkEntry(p.pm.id, id, {
          stage: "PROJECT",
          decision: "REJECTED",
          rejectionReason: "اصلاح گزارش",
        });
        assert.equal(
          (
            await sql`SELECT count(*)::int AS n FROM work_entry_approvals WHERE work_entry_id=${id}`
          )[0].n,
          3,
        );
        const history = await approvals.getApprovals(p.dm.id, { view: "history" });
        assert.equal(
          history.rows.find((r) => r.reason === "اصلاح ساعت").manHours,
          entries[1].manHours,
        );
        assert.equal(
          (
            await sql`SELECT count(*)::int AS n FROM audit_logs WHERE action='WORK_ENTRY_RESUBMITTED'`
          )[0].n,
          1,
        );
      },
    );
    await t.test(
      "same manager and explicit self-approval require two actions; current assignment routes pending work",
      async () => {
        await sql`UPDATE projects SET manager_user_id=${p.dm.id} WHERE id=${project.id}`;
        const current = await day();
        await save(current.entries.map(input));
        const id = entries[1].id;
        await approvals.decideWorkEntry(p.dm.id, id, { stage: "DEPARTMENT", decision: "APPROVED" });
        assert.equal(
          (await day()).entries.find((e) => e.id === id).status,
          "PENDING_PROJECT_APPROVAL",
        );
        await sql`UPDATE projects SET manager_user_id=${p.pm.id} WHERE id=${project.id}`;
        await assert.rejects(
          approvals.decideWorkEntry(p.dm.id, id, { stage: "PROJECT", decision: "APPROVED" }),
          (e) => e.status === 403,
        );
        await approvals.decideWorkEntry(p.pm.id, id, { stage: "PROJECT", decision: "APPROVED" });
        const own = await work.getOwnWorkEntriesForDate(p.dm.id, f.date);
        const submitted = await work.updateOwnDailyEntries(p.dm.id, f.date, {
          version: own.version,
          entries: [f.row()],
        });
        await approvals.decideWorkEntry(p.dm.id, submitted.entries[0].id, {
          stage: "DEPARTMENT",
          decision: "APPROVED",
        });
        assert.equal(
          (await work.getOwnWorkEntriesForDate(p.dm.id, f.date)).entries[0].status,
          "PENDING_PROJECT_APPROVAL",
        );
        await sql`UPDATE projects SET manager_user_id=${p.dm.id} WHERE id=${project.id}`;
        await approvals.decideWorkEntry(p.dm.id, submitted.entries[0].id, {
          stage: "PROJECT",
          decision: "APPROVED",
        });
        assert.equal(
          (await work.getOwnWorkEntriesForDate(p.dm.id, f.date)).entries[0].status,
          "APPROVED",
        );
        assert.equal(
          (
            await sql`SELECT count(*)::int AS n FROM work_entry_approvals WHERE work_entry_id=${submitted.entries[0].id} AND manager_user_id=${p.dm.id}`
          )[0].n,
          2,
        );
        await sql`UPDATE projects SET manager_user_id=${p.pm.id} WHERE id=${project.id}`;
      },
    );
    await t.test(
      "approval transactions serialize concurrent tabs and reject duplicates",
      async () => {
        const own = await work.getOwnWorkEntriesForDate(p.other.id, f.date);
        const saved = await work.updateOwnDailyEntries(p.other.id, f.date, {
          version: own.version,
          entries: [f.row()],
        });
        const results = await Promise.allSettled(
          [1, 2].map(() =>
            approvals.decideWorkEntry(p.dm.id, saved.entries[0].id, {
              stage: "DEPARTMENT",
              decision: "APPROVED",
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          (
            await sql`SELECT count(*)::int AS n FROM work_entry_approvals WHERE work_entry_id=${saved.entries[0].id}`
          )[0].n,
          1,
        );
      },
    );
    await t.test("audit failure rolls back business and approval history together", async () => {
      const before = (await sql`SELECT count(*)::int AS n FROM work_entry_approvals`)[0].n;
      await sql.unsafe(
        `CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$`,
      );
      await sql.unsafe(
        `CREATE TRIGGER audit_fixture BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit()`,
      );
      try {
        const [pending] =
          await sql`SELECT id FROM work_entries WHERE status='PENDING_PROJECT_APPROVAL' LIMIT 1`;
        await assert.rejects(
          approvals.decideWorkEntry(p.pm.id, pending.id, {
            stage: "PROJECT",
            decision: "APPROVED",
          }),
        );
        assert.equal(
          (await sql`SELECT status FROM work_entries WHERE id=${pending.id}`)[0].status,
          "PENDING_PROJECT_APPROVAL",
        );
        assert.equal((await sql`SELECT count(*)::int AS n FROM work_entry_approvals`)[0].n, before);
        const old = await day();
        await assert.rejects(save([...old.entries.map(input), f.row()]));
        assert.equal((await day()).entries.length, old.entries.length);
      } finally {
        await sql.unsafe(`DROP TRIGGER audit_fixture ON audit_logs`);
        await sql.unsafe(`DROP FUNCTION fail_audit()`);
      }
    });
    await t.test(
      "automatic old-week read-only leaves historical manager approvals and exports available",
      async () => {
        f.setToday("2026-09-19");
        assert.equal((await day()).period.status, "LOCKED");
        await assert.rejects(save((await day()).entries.map(input)), (e) => e.status === 423);
        const [pending] =
          await sql`SELECT id FROM work_entries WHERE status='PENDING_PROJECT_APPROVAL' LIMIT 1`;
        await approvals.decideWorkEntry(p.pm.id, pending.id, {
          stage: "PROJECT",
          decision: "APPROVED",
        });
        const service = f.mod("business-reports"),
          parse = load("src/lib/business-report-query.ts").parseBusinessReportQuery;
        const q = parse({ from: "2026-09-12", to: "2026-09-18" });
        const result = await service.getBusinessReport(q);
        const exported = await service.getBusinessReportExport(q, "details");
        assert.equal(result.totalHours, exported.totalHours);
        assert.ok(result.entryCount > 0);
        await sql`UPDATE projects SET is_active=false WHERE id=${project.id}`;
        await sql`UPDATE report_types SET is_active=false WHERE id=${report.id}`;
        assert.equal((await service.getBusinessReport(q)).totalHours, result.totalHours);
        assert.equal((await day()).entries.length, 2);
      },
    );
  } finally {
    await f.close();
  }
});
