const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const {
  parseBusinessReportQuery: parse,
  queryRecord,
  reportHours,
  reportHref,
} = load("src/lib/business-report-query.ts");
test("report query defaults, strict allowlists, dates and URL round trip", () => {
  const base = { from: "2026-01-03", to: "2026-01-09" };
  assert.equal(new Date(parse({}).from).getUTCDay(), 6);
  for (const invalid of [
    { from: "2026-01-05" },
    { ...base, to: "2026-01-02" },
    { ...base, to: "2027-01-04" },
    { ...base, from: "2026-02-30" },
    { ...base, employeeId: "bad" },
    { ...base, groupBy: "project", groupBySecondary: "project" },
    { ...base, groupBySecondary: "date" },
    { ...base, sort: "DROP TABLE users" },
    { ...base, pageSize: 10 },
    { ...base, page: 0 },
    { ...base, unknown: "x" },
  ])
    assert.throws(() => parse(invalid));
  assert.throws(() => parse(queryRecord(new URLSearchParams("page=1&page=2"))));
  const q = parse({ ...base, groupBy: "project", groupBySecondary: "employee", pageSize: "25" });
  assert.deepEqual(parse(queryRecord(new URL(reportHref(q), "http://test").searchParams)), q);
  assert.equal(reportHours("472.500000"), "472.5");
  assert.equal(reportHours("100000000000000000.25"), "100000000000000000.25");
  assert.equal(reportHours("0.00"), "0");
});
