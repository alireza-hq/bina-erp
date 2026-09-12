const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

test("master input validation rejects invalid roles/IDs, unknown relationship fields and empty edits", () => {
  const v = load("src/lib/validation.ts");
  assert.equal(v.userAdminSchema.safeParse({ role: "admin" }).success, false);
  assert.equal(v.userAdminSchema.safeParse({ role: "BUSINESS_ADMIN" }).success, true);
  assert.equal(v.userAdminSchema.safeParse({ departmentId: "wrong" }).success, false);
  assert.equal(v.userAdminSchema.safeParse({ isActive: false }).success, true);
  assert.equal(v.projectSchema.safeParse({ code: " ", name: "Test" }).success, false);
  assert.equal(v.departmentSchema.safeParse({ name: " " }).success, false);
  assert.equal(
    v.projectFileSchema.safeParse({ code: "PID-001", name: "PID", projectId: "anything" }).success,
    false,
  );
  assert.equal(v.projectUpdateSchema.safeParse({}).success, false);
  assert.deepEqual(v.projectUpdateSchema.parse({ name: "Edited" }), { name: "Edited" });
  assert.deepEqual(v.departmentUpdateSchema.parse({ name: "Edited" }), { name: "Edited" });
});
