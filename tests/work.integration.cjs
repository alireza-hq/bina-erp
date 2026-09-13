const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID, randomBytes, createHash, createHmac } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql, eq } = require("drizzle-orm");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());

test("employee reporting on PostgreSQL (isolated transaction rolled back)", async (t) => {
  const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  const schema = load("src/db/schema.ts");
  const root = drizzle(client, { schema });
  const scratch = `phase2_${randomUUID().replaceAll("-", "")}`,
    archive = `${scratch}_archive`;
  const rollback = new Error("fixture rollback"),
    jar = new Map();
  process.env.JWT_SECRET = "phase2-test-secret-with-at-least-32-characters";
  try {
    await root.transaction(async (tx) => {
      await tx.execute(sql.raw(`CREATE SCHEMA "${scratch}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${scratch}", pg_catalog`));
      for (const entry of JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries) {
        const source = readFileSync(`drizzle/${entry.tag}.sql`, "utf8")
          .replaceAll('"public"', `"${scratch}"`)
          .replaceAll('"legacy_letter_list"', `"${archive}"`);
        for (const statement of source.split("--> statement-breakpoint"))
          if (statement.trim()) await tx.execute(sql.raw(statement));
      }
      const ids = {},
        cookies = {};
      for (const [name, role] of [
        ["employee", "EMPLOYEE"],
        ["other", "EMPLOYEE"],
        ["business", "BUSINESS_ADMIN"],
        ["it", "IT_ADMIN"],
      ]) {
        const [user] = await tx
          .insert(schema.users)
          .values({ ldapId: `CN=${name},DC=test`, username: name, displayName: name, role })
          .returning();
        ids[name] = user.id;
        const raw = randomBytes(32).toString("base64url");
        cookies[name] =
          `${raw}.${createHmac("sha256", process.env.JWT_SECRET).update(raw).digest("base64url")}`;
        await tx.insert(schema.sessions).values({
          userId: user.id,
          tokenHash: createHash("sha256").update(raw).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        });
      }
      const [p1, p2, inactive] = await tx
        .insert(schema.projects)
        .values([
          { name: "Project A", code: "A" },
          { name: "Project B", code: "B" },
          { name: "Inactive", code: "OFF", isActive: false },
        ])
        .returning();
      const [f1, f2, f3, offFile, offProjectFile] = await tx
        .insert(schema.projectFiles)
        .values([
          { projectId: p1.id, name: "PID", code: "PID-101" },
          { projectId: p1.id, name: "MTO", code: "MTO-12" },
          { projectId: p2.id, name: "Vendor document", code: "VD-77" },
          { projectId: p1.id, name: "Inactive file", code: "OFF", isActive: false },
          { projectId: inactive.id, name: "Inactive project file", code: "OFF" },
        ])
        .returning();
      const date = "2026-01-05";
      const row = (project = p1, file = f1, hours = "2") => ({
        projectId: project.id,
        projectFileId: file.id,
        description: "بررسی نقشه",
        manHours: hours,
      });
      function modules(connection) {
        const mocks = {
          "@/db": { db: connection },
          "@/db/schema": schema,
          "next/headers": { cookies: async () => ({ get: (key) => jar.get(key) }) },
        };
        const auth = load("src/lib/auth.ts", mocks);
        const service = load("src/lib/work-entries.ts", mocks);
        const api = load("src/lib/work-api.ts", {
          ...mocks,
          "@/lib/auth": auth,
          "@/lib/work-entries": service,
        });
        return { api, service };
      }
      async function call(
        actor,
        action = "ownDayApi",
        method = "GET",
        body,
        selectedDate = date,
        query = "",
      ) {
        jar.clear();
        if (actor) jar.set("bina_session", { value: cookies[actor] });
        const request = new Request(`http://localhost:3000/api/work-entries${query}`, {
          method,
          headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        try {
          return await tx.transaction(async (save) => {
            const response = await modules(save).api[action](request, selectedDate);
            if (response.status >= 400) throw { response };
            return response;
          });
        } catch (error) {
          if (error.response) return error.response;
          throw error;
        }
      }
      async function data(response, status = 200) {
        const result = await response.json();
        assert.equal(response.status, status, JSON.stringify(result));
        return result.data;
      }
      const read = (actor = "employee", selectedDate = date) =>
        call(actor, "ownDayApi", "GET", undefined, selectedDate).then(data);
      const save = (actor, day, entries) =>
        call(actor, "ownDayApi", "PUT", { version: day.version, entries }, day.date);
      const values = (day) =>
        day.entries.map(({ id, projectId, projectFileId, description, manHours }) => ({
          id,
          projectId,
          projectFileId,
          description,
          manHours,
        }));
      let day, other;
      await t.test("authentication, exact schema types and relational indexes", async () => {
        for (const action of ["ownDayApi", "ownWeekApi", "workOptionsApi"])
          assert.equal((await call(null, action)).status, 401);
        assert.equal((await call(null, "ownDayApi", "PUT", {})).status, 401);
        const columns = await tx.execute(
          sql`select column_name,data_type,numeric_precision,numeric_scale from information_schema.columns where table_schema=${scratch} and table_name='work_entries'`,
        );
        assert.equal(columns.find((c) => c.column_name === "work_date").data_type, "date");
        assert.equal(columns.find((c) => c.column_name === "man_hours").numeric_scale, 2);
        assert.equal(columns.find((c) => c.column_name === "man_hours").numeric_precision, 5);
        const indexes = await tx.execute(
          sql`select indexname from pg_indexes where schemaname=${scratch} and tablename='work_entries'`,
        );
        assert.ok(indexes.some((i) => i.indexname === "work_entries_employee_date_idx"));
        assert.ok(indexes.some((i) => i.indexname === "work_entries_project_date_idx"));
      });
      await t.test(
        "multiple rows save atomically with decimal-safe daily and own weekly totals",
        async () => {
          const empty = await read();
          day = await data(
            await save("employee", empty, [row(p1, f1, "2"), row(p1, f2, "1.5"), row(p2, f3, "3")]),
          );
          assert.equal(day.entries.length, 3);
          assert.equal(day.totalHours, "6.50");
          assert.equal(day.highTotal, false);
          assert.ok(day.entries.some((entry) => entry.manHours === "1.50"));
          const week = await data(
            await call("employee", "ownWeekApi", "GET", undefined, date, `?week=${date}`),
          );
          assert.equal(week.totalHundredths, 650);
          assert.equal(week.count, 3);
          assert.equal(
            (await save("employee", empty, [row()])).status,
            409,
            "duplicate submission is stale",
          );
          other = await data(await save("other", await read("other"), [row(p1, f1, "8")]));
          assert.equal((await read()).entries.length, 3);
          for (const role of ["business", "it"])
            assert.equal(
              (await read(role)).entries.length,
              0,
              "admins have no cross-employee override",
            );
        },
      );
      await t.test(
        "ownership: reject foreign row IDs and client employeeId; deletion only affects the caller",
        async () => {
          const foreign = values(other)[0];
          assert.equal((await save("employee", day, [foreign])).status, 404);
          assert.equal(
            (
              await call("employee", "ownDayApi", "PUT", {
                version: day.version,
                entries: [],
                employeeId: ids.other,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await call("employee", "ownDayApi", "PUT", {
                version: day.version,
                entries: [{ ...row(), employeeId: ids.other }],
              })
            ).status,
            400,
          );
          for (const action of ["ownDayApi", "ownWeekApi"])
            assert.equal(
              (await call("employee", action, "GET", undefined, date, `?employeeId=${ids.other}`))
                .status,
              400,
            );
          const differentDay = await read("employee", "2026-01-06");
          assert.equal(
            (await save("employee", differentDay, values(day))).status,
            404,
            "same user's ID from another date cannot be moved",
          );
          assert.equal((await read("other")).version, other.version);
        },
      );
      await t.test(
        "validation rejects invalid/inactive relationships, descriptions, hours and unbounded bodies without partial writes",
        async () => {
          const invalidRows = [
            { ...row(), projectId: randomUUID() },
            { ...row(), projectFileId: randomUUID() },
            row(p1, f3),
            row(inactive, offProjectFile),
            row(p1, offFile),
            { ...row(), description: " " },
            { ...row(), description: "x".repeat(2001) },
            { ...row(), manHours: "0" },
            { ...row(), manHours: "-1" },
            { ...row(), manHours: "1.001" },
            { ...row(), manHours: "24.01" },
          ];
          for (const bad of invalidRows) {
            const response = await save("employee", day, [...values(day), row(p1, f1, "0.5"), bad]);
            assert.equal(response.status, 400);
            assert.equal(
              (await read()).version,
              day.version,
              "failure did not add/delete/update rows",
            );
          }
          assert.equal(
            (await save("employee", day, Array(51).fill(row(p1, f1, "0.01")))).status,
            400,
          );
          assert.equal((await save("employee", day, [values(day)[0], values(day)[0]])).status, 400);
          assert.equal(
            (
              await call("employee", "ownDayApi", "PUT", {
                version: day.version,
                entries: [{ ...row(), description: "x".repeat(524289) }],
              })
            ).status,
            413,
          );
          assert.equal(
            (
              await call(
                "employee",
                "ownDayApi",
                "PUT",
                { version: day.version, entries: [row()] },
                "2026-02-30",
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                "employee",
                "ownDayApi",
                "PUT",
                { version: day.version, entries: [row()] },
                "2099-12-31",
              )
            ).status,
            400,
          );
          assert.equal((await read()).version, day.version);
        },
      );
      await t.test(
        "edit set updates/adds/removes safely, preserves IDs, and rejects stale or excessive totals",
        async () => {
          const before = day;
          const retained = values(day).slice(0, 2);
          day = await data(
            await save("employee", day, [
              { ...retained[0], description: "اصلاح نقشه", manHours: "4.25" },
              retained[1],
              row(p1, f2, "0.25"),
            ]),
          );
          assert.equal(day.entries.length, 3);
          assert.ok(day.entries.some((e) => e.id === retained[0].id));
          assert.ok(day.entries.some((e) => e.id === retained[1].id));
          assert.equal(
            day.entries.some((e) => e.id === before.entries[2].id),
            false,
          );
          assert.equal((await save("employee", before, values(before))).status, 409);
          day = await data(await save("employee", day, [{ ...values(day)[0], manHours: "13.5" }]));
          assert.equal(day.totalHours, "13.50");
          assert.equal(day.highTotal, true);
          assert.equal(
            (await save("employee", day, [row(p1, f1, "13"), row(p1, f2, "12")])).status,
            400,
          );
        },
      );
      await t.test(
        "historical inactive references remain readable/editable; new use is rejected; foreign keys retain history",
        async () => {
          // Use a known active pair before deactivation.
          day = await data(await save("employee", day, [row(p1, f1, "1.5")]));
          await tx
            .update(schema.projects)
            .set({ isActive: false })
            .where(eq(schema.projects.id, p1.id));
          await tx
            .update(schema.projectFiles)
            .set({ isActive: false })
            .where(eq(schema.projectFiles.id, f1.id));
          const historical = await read();
          assert.equal(historical.entries[0].projectName, "Project A");
          assert.equal(historical.entries[0].projectActive, false);
          assert.equal(historical.entries[0].fileActive, false);
          day = await data(
            await save("employee", historical, [
              { ...values(historical)[0], description: "تصحیح سابقه", manHours: "1.25" },
            ]),
          );
          assert.equal(day.totalHours, "1.25");
          assert.equal(
            (await save("employee", day, [...values(day), row(p1, f1, "1")])).status,
            400,
          );
          const available = await data(
            await call("employee", "workOptionsApi", "GET", undefined, date, `?projectId=${p1.id}`),
          );
          assert.equal(available.length, 0);
          const expectCode = (code) => (error) => error.code === code || error.cause?.code === code;
          await assert.rejects(
            tx.transaction((nested) =>
              nested
                .insert(schema.workEntries)
                .values({ ...row(p2, f1, "1"), employeeId: ids.employee, workDate: date }),
            ),
            expectCode("23503"),
          );
          await assert.rejects(
            tx.transaction((nested) =>
              nested
                .insert(schema.workEntries)
                .values({ ...row(p2, f3, "0"), employeeId: ids.employee, workDate: date }),
            ),
            expectCode("23514"),
          );
          await assert.rejects(
            tx.transaction((nested) =>
              nested.delete(schema.projectFiles).where(eq(schema.projectFiles.id, f1.id)),
            ),
            expectCode("23503"),
          );
          await assert.rejects(
            tx.transaction((nested) =>
              nested.delete(schema.users).where(eq(schema.users.id, ids.employee)),
            ),
            expectCode("23503"),
          );
        },
      );
      await t.test(
        "inactive users are denied and clearing one's date does not delete another user's records",
        async () => {
          await tx
            .update(schema.users)
            .set({ isActive: false })
            .where(eq(schema.users.id, ids.employee));
          assert.equal((await call("employee")).status, 401);
          assert.equal((await save("employee", day, [])).status, 401);
          await assert.rejects(
            modules(tx).service.updateOwnDailyEntries(ids.employee, date, {
              version: day.version,
              entries: [],
            }),
            /غیرفعال/,
          );
          await tx
            .update(schema.users)
            .set({ isActive: true })
            .where(eq(schema.users.id, ids.employee));
          day = await data(await save("employee", day, []));
          assert.equal(day.totalHours, "0.00");
          assert.equal(day.entries.length, 0);
          assert.equal((await read("other")).entries[0].id, other.entries[0].id);
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
