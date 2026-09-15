const { test } = require("node:test");
const assert = require("node:assert/strict");
const readWorkbook = require("read-excel-file/node");
const { load } = require("./helpers.cjs");
const queryModule = load("src/lib/report-export-query.ts");
const workbookModule = load("src/lib/report-workbook.ts");
const { parseBusinessReportQuery } = load("src/lib/business-report-query.ts");
test("export query validates mode and report state; filenames cannot contain user text", () => {
  const q = parseBusinessReportQuery({ from: "2026-01-03", to: "2026-01-09" });
  for (const invalid of [
    { mode: "../../evil" },
    { mode: ["details", "summary"] },
    { mode: "details", sort: "DROP" },
    { mode: "details", filename: "evil.xlsx" },
  ])
    assert.throws(() => queryModule.parseReportExportQuery(invalid));
  assert.equal(
    queryModule.exportFilename(q, "details"),
    "work-report-details-2026-01-03-to-2026-01-09.xlsx",
  );
  assert.match(queryModule.exportHref(q, "summary"), /mode=summary$/);
});
test("actual XLSX parses Persian text, numeric hours, safe strings and overall summary", async () => {
  const query = parseBusinessReportQuery({ from: "2026-01-03", to: "2026-01-09" });
  const entries = ["0.25", "0.50", "1.25", "3.75"].map((manHours, i) => ({
    date: "2026-01-03",
    employeeName: ['=HYPERLINK("evil")', "+cmd", "-cmd", "@SUM(A1)"][i],
    status: "APPROVED",
    username: "ali",
    department: "مهندسی",
    projectCode: "A",
    projectName: "پروژه",
    report: "A / PID",
    description: "بررسی نقشه\nمتن فارسی",
    manHours,
  }));
  const data = { query, entries, groups: [], entryCount: 4, totalHours: "5.75", filterLabels: {} };
  const sheets = await readWorkbook(
    await workbookModule.createReportWorkbook(data, "details", new Date("2026-01-10T00:00:00Z")),
  );
  assert.deepEqual(
    sheets.map((s) => s.sheet),
    ["گزارش تفصیلی", "مشخصات گزارش"],
  );
  assert.equal(sheets[0].data.length, 5);
  assert.equal(sheets[0].data[0][8], "نفر-ساعت");
  assert.deepEqual(
    sheets[0].data.slice(1).map((r) => r[8]),
    [0.25, 0.5, 1.25, 3.75],
  );
  assert.equal(sheets[0].data[1][2], "ali");
  assert.equal(sheets[0].data[1][9], "تأیید شده");
  assert.equal(sheets[0].data[1][1], '\'=HYPERLINK("evil")');
  assert.match(sheets[0].data[1][0], /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
  assert.equal(sheets[0].data[1][7], "بررسی نقشه\nمتن فارسی");
  assert.equal(sheets[1].data.find((r) => r[0] === "جمع نفر-ساعت منبع")[1], 5.75);
  const summary = await readWorkbook(await workbookModule.createReportWorkbook(data, "summary"));
  assert.deepEqual(summary[0].data[1], ["جمع کل فیلترشده", 4, 5.75]);
  for (const text of ["=1", "+1", "-1", "@x", " \t=cmd"]) {
    const cell = workbookModule.workbookText(text);
    assert.equal(cell.type, String);
    assert.ok(cell.value.startsWith("'"));
  }
  assert.throws(() => workbookModule.workbookNumber("1.4999999997"));
  assert.throws(() => workbookModule.workbookText("x".repeat(32761)));
  const empty = await readWorkbook(
    await workbookModule.createReportWorkbook(
      { ...data, entries: [], entryCount: 0, totalHours: "0" },
      "details",
    ),
  );
  assert.equal(empty[0].data.length, 1);
});
test("export API returns safe errors without exposing database details", async () => {
  const service = {
    getBusinessReportExport: async () => {
      throw new Error("SQL secret details");
    },
  };
  const api = load("src/lib/report-export-api.ts", {
    "@/lib/auth": { requireApiRole: async () => ({ user: { id: "test" } }) },
    "@/lib/business-reports": service,
  });
  const response = await api.reportExportApi(
    new Request("http://localhost/api/admin/reports/export?mode=details"),
  );
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("SQL"));
});
