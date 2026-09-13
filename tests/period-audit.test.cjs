const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
test("period weeks reuse Saturday mapping; audit projections exclude authentication secrets", () => {
  const { periodWeekSchema } = load("src/lib/period-model.ts");
  const { weekStart, todayInTehran } = load("src/lib/work-reporting.ts");
  assert.equal(periodWeekSchema.parse("2026-01-03"), "2026-01-03");
  for (const date of ["2026-01-04", "2026-02-30", "bad"])
    assert.throws(() => periodWeekSchema.parse(date));
  assert.equal(new Date(periodWeekSchema.parse(weekStart(todayInTehran()))).getUTCDay(), 6);
  const { auditData } = load("src/lib/audit.ts");
  const data = auditData("USER", {
    role: "EMPLOYEE",
    ldapId: "secret DN",
    password: "secret",
    tokenHash: "secret",
    username: "ali",
    email: "unused",
  });
  assert.deepEqual(data, { username: "ali", role: "EMPLOYEE" });
  const { parseAuditQuery } = load("src/lib/audit-query.ts");
  for (const input of [
    { page: 0 },
    { action: "DROP" },
    { entityType: "bad" },
    { unknown: 1 },
    { from: "2026-01-10", to: "2026-01-01" },
  ])
    assert.throws(() => parseAuditQuery(input));
});
