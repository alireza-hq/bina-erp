const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { load } = require("./helpers.cjs");
const rules = load("src/lib/work-reporting.ts");
const validation = load("src/lib/work-validation.ts");

test("decimal arithmetic accepts Persian fractions without floating-point artifacts", () => {
  for (const [input, amount] of [
    ["0.25", 25],
    ["۰٫۵", 50],
    ["١.٥", 150],
    ["7.5", 750],
    ["0.01", 1],
  ])
    assert.equal(rules.hoursToHundredths(input), amount);
  for (const input of ["NaN", "Infinity", "1e2", "-1", "1.001", "1,5", "", "01.5"])
    assert.equal(rules.hoursToHundredths(input), null);
  const total = ["2", "1.5", "3"].reduce((sum, value) => sum + rules.hoursToHundredths(value), 0);
  assert.equal(rules.hundredthsToHours(total), "6.50");
  assert.equal(rules.displayHours(total), "6.5");
  assert.equal(rules.displayHours(1000), "10");
  assert.equal(rules.displayHours(0), "0");
  assert.equal(
    rules.hundredthsToHours(rules.hoursToHundredths("0.1") + rules.hoursToHundredths("0.2")),
    "0.30",
  );
});
test("Gregorian dates validate strictly; weeks start Saturday and today uses Tehran", () => {
  assert.equal(rules.isCalendarDate("2024-02-29"), true);
  for (const date of [
    "2025-02-29",
    "2026-02-30",
    "1405/06/21",
    "1999-12-31",
    "2100-01-01",
    "2026-1-01",
  ])
    assert.equal(rules.isCalendarDate(date), false);
  assert.equal(rules.weekStart("2026-09-13"), "2026-09-12");
  assert.equal(rules.shiftDate("2025-12-31", 1), "2026-01-01");
  assert.equal(rules.todayInTehran(new Date("2026-09-12T21:00:00Z")), "2026-09-13");
  assert.equal(validation.writableDateSchema.safeParse("2099-12-31").success, false);
});
test("work bodies bound rows, descriptions and totals; reject impersonation, duplicate IDs and numeric JSON hours", () => {
  const row = {
    projectId: randomUUID(),
    projectFileId: randomUUID(),
    description: "Review",
    manHours: "1.50",
  };
  const body = { version: "a".repeat(64), entries: [row] };
  assert.equal(validation.dailyEntriesSchema.safeParse(body).success, true);
  for (const manHours of ["0", "-1", "24.01", "1.001", 1.5])
    assert.equal(
      validation.dailyEntriesSchema.safeParse({ ...body, entries: [{ ...row, manHours }] }).success,
      false,
    );
  assert.equal(
    validation.dailyEntriesSchema.safeParse({ ...body, employeeId: randomUUID() }).success,
    false,
  );
  assert.equal(
    validation.dailyEntriesSchema.safeParse({
      ...body,
      entries: [{ ...row, employeeId: randomUUID() }],
    }).success,
    false,
  );
  assert.equal(
    validation.dailyEntriesSchema.safeParse({ ...body, entries: Array(51).fill(row) }).success,
    false,
  );
  for (const description of [" ", "a".repeat(2001)])
    assert.equal(
      validation.dailyEntriesSchema.safeParse({ ...body, entries: [{ ...row, description }] })
        .success,
      false,
    );
  const sameId = { ...row, id: randomUUID() };
  assert.equal(
    validation.dailyEntriesSchema.safeParse({ ...body, entries: [sameId, sameId] }).success,
    false,
  );
  assert.equal(
    validation.dailyEntriesSchema.safeParse({ ...body, entries: [{ ...row, manHours: "13.5" }] })
      .success,
    true,
  );
  assert.equal(
    validation.dailyEntriesSchema.safeParse({
      ...body,
      entries: [
        { ...row, manHours: "13" },
        { ...row, manHours: "12" },
      ],
    }).success,
    false,
  );
  assert.equal(validation.dailyEntriesSchema.safeParse({ ...body, entries: [] }).success, true);
});
