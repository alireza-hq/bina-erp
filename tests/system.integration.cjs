const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID, randomBytes, createHash, createHmac } = require("node:crypto");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { sql, eq } = require("drizzle-orm");
const { load } = require("./helpers.cjs");
require("@next/env").loadEnvConfig(process.cwd());

test("Phase 1 real PostgreSQL integration (all schema/data changes rolled back)", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  const schema = load("src/db/schema.ts");
  const root = drizzle(client, { schema });
  const scratch = `phase1_${randomUUID().replaceAll("-", "")}`;
  const archive = `${scratch}_archive`;
  const rollback = new Error("intentional fixture rollback");
  const jar = new Map();
  process.env.JWT_SECRET = "phase1-tests-only-not-a-production-secret";
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
      const [onboardDepartment] = await tx
        .insert(schema.departments)
        .values({ name: "Initial" })
        .returning();
      const ids = {};
      const cookies = {};
      for (const role of ["EMPLOYEE", "BUSINESS_ADMIN", "IT_ADMIN"]) {
        const [user] = await tx
          .insert(schema.users)
          .values({
            ldapId: `CN=${role},DC=test`,
            username: role.toLowerCase(),
            displayName: role,
            departmentId: onboardDepartment.id,
            profileCompletedAt: new Date(),
            role,
          })
          .returning();
        ids[role] = user.id;
        const raw = randomBytes(32).toString("base64url");
        cookies[role] =
          `${raw}.${createHmac("sha256", process.env.JWT_SECRET).update(raw).digest("base64url")}`;
        await tx.insert(schema.sessions).values({
          userId: user.id,
          tokenHash: createHash("sha256").update(raw).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        });
      }
      function modules(connection) {
        const mocks = {
          "@/db": { db: connection },
          "@/db/schema": schema,
          "next/headers": {
            cookies: async () => ({
              get: (key) => jar.get(key),
              set: (key, value) => jar.set(key, { value }),
              delete: (key) => jar.delete(key),
            }),
          },
          "next/navigation": {
            redirect: (url) => {
              throw new Error(`redirect:${url}`);
            },
          },
        };
        const auth = load("src/lib/auth.ts", mocks);
        return { auth, api: load("src/lib/admin-api.ts", { ...mocks, "@/lib/auth": auth }) };
      }
      function signIn(role) {
        jar.clear();
        if (role) jar.set("bina_session", { value: cookies[role] });
      }
      async function call(role, method, action, args = [], body) {
        signIn(role);
        try {
          return await tx.transaction(async (savepoint) => {
            const request = new Request("http://localhost:3000/api/admin/test", {
              method,
              headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
              ...(body === undefined
                ? {}
                : {
                    body: JSON.stringify(
                      action === "masterCollection" &&
                        method === "POST" &&
                        ["departments", "projects"].includes(args[0])
                        ? { managerUserId: ids.IT_ADMIN, ...body }
                        : body,
                    ),
                  }),
            });
            const response = await modules(savepoint).api[action](request, ...args);
            // A caught database constraint failure still needs its savepoint rolled back.
            if (response.status >= 400) throw { response };
            return response;
          });
        } catch (error) {
          if (error.response) return error.response;
          throw error;
        }
      }
      const data = async (response, status = 200) => {
        const result = await response.json();
        assert.equal(response.status, status, JSON.stringify(result));
        return result.data;
      };
      let department, project;
      await t.test(
        "every admin operation denies anonymous, employee and business-admin requests",
        async () => {
          const operations = [
            ["GET", "userCollection", []],
            ["PATCH", "updateUser", [ids.EMPLOYEE], { role: "IT_ADMIN" }],
            ...["departments", "projects"].flatMap((kind) => [
              ["GET", "masterCollection", [kind]],
              ["POST", "masterCollection", [kind], { name: "Test", code: "Test" }],
              ["PATCH", "masterItem", [kind, randomUUID()], { isActive: false }],
            ]),
          ];
          for (const role of [null, "EMPLOYEE", "BUSINESS_ADMIN"])
            for (const [method, action, args, body] of operations)
              assert.equal(
                (await call(role, method, action, args, body)).status,
                role ? 403 : 401,
                `${role} ${action}`,
              );
          assert.ok((await data(await call("IT_ADMIN", "GET", "userCollection"))).length >= 3);
          for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"]) {
            signIn(role);
            await assert.rejects(modules(tx).auth.requireRole("IT_ADMIN"), /redirect:\/dashboard/);
          }
        },
      );
      await t.test(
        "departments create/edit/deactivate, normalized active uniqueness and safe reactivation",
        async () => {
          department = await data(
            await call("IT_ADMIN", "POST", "masterCollection", ["departments"], {
              name: "Engineering",
              code: "ENG",
            }),
            201,
          );
          assert.equal(
            (
              await call("IT_ADMIN", "POST", "masterCollection", ["departments"], {
                name: " engineering ",
              })
            ).status,
            409,
          );
          const edited = await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["departments", department.id], {
              code: "ENG-1",
            }),
          );
          assert.equal(edited.code, "ENG-1");
          const off = await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["departments", department.id], {
              isActive: false,
            }),
          );
          assert.equal(off.isActive, false);
          const same = await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["departments", department.id], {
              code: "ENG-2",
            }),
          );
          assert.equal(same.isActive, false);
          await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["departments", department.id], {
              isActive: true,
            }),
          );
        },
      );
      await t.test(
        "user role/department assignments, inactive department retention and session revocation",
        async () => {
          const changed = await data(
            await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], {
              role: "BUSINESS_ADMIN",
              departmentId: department.id,
              displayName: "نام فارسی",
            }),
          );
          assert.equal(changed.role, "BUSINESS_ADMIN");
          assert.equal(changed.departmentId, department.id);
          assert.equal(
            (await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], { role: "admin" }))
              .status,
            400,
          );
          assert.equal(
            (await call("IT_ADMIN", "PATCH", "updateUser", ["invalid"], { isActive: false }))
              .status,
            400,
          );
          assert.equal(
            (
              await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], {
                departmentId: randomUUID(),
              })
            ).status,
            409,
          );
          await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["departments", department.id], {
              isActive: false,
            }),
          );
          assert.equal(
            (
              await call("IT_ADMIN", "PATCH", "updateUser", [ids.BUSINESS_ADMIN], {
                departmentId: department.id,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await data(
                await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], {
                  departmentId: department.id,
                  displayName: "نام فارسی جدید",
                }),
              )
            ).departmentId,
            department.id,
          );
          assert.equal(
            (await call("IT_ADMIN", "PATCH", "updateUser", [ids.IT_ADMIN], { role: "EMPLOYEE" }))
              .status,
            409,
          );
          assert.equal(
            (await call("IT_ADMIN", "PATCH", "updateUser", [ids.IT_ADMIN], { isActive: false }))
              .status,
            409,
          );
          await data(
            await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], { isActive: false }),
          );
          signIn("EMPLOYEE");
          assert.equal(await modules(tx).auth.getCurrentUser(), null);
          assert.equal(
            (
              await tx
                .select()
                .from(schema.sessions)
                .where(eq(schema.sessions.userId, ids.EMPLOYEE))
            ).length,
            0,
          );
          await data(
            await call("IT_ADMIN", "PATCH", "updateUser", [ids.EMPLOYEE], { isActive: true }),
          );
          signIn("EMPLOYEE");
          assert.equal(
            await modules(tx).auth.getCurrentUser(),
            null,
            "reactivation does not resurrect sessions",
          );
        },
      );
      await t.test(
        "projects create/edit, code uniqueness, validation and nondestructive deactivation",
        async () => {
          project = await data(
            await call("IT_ADMIN", "POST", "masterCollection", ["projects"], {
              code: "P-1",
              name: "Project one",
            }),
            201,
          );
          await data(
            await call("IT_ADMIN", "POST", "masterCollection", ["projects"], {
              code: "P-2",
              name: "Project two",
            }),
            201,
          );
          assert.equal(
            (
              await call("IT_ADMIN", "POST", "masterCollection", ["projects"], {
                code: " p-1 ",
                name: "Duplicate",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await call("IT_ADMIN", "POST", "masterCollection", ["projects"], {
                code: "",
                name: "Missing code",
              })
            ).status,
            400,
          );
          const edited = await data(
            await call("IT_ADMIN", "PATCH", "masterItem", ["projects", project.id], {
              name: "Updated",
              description: "Details",
            }),
          );
          assert.equal(edited.name, "Updated");
          assert.equal(
            (
              await call("IT_ADMIN", "PATCH", "masterItem", ["projects", randomUUID()], {
                name: "Missing",
              })
            ).status,
            404,
          );
        },
      );
      await t.test("global Report master data validates uniqueness and activation", async () => {
        const report = await data(
          await call("IT_ADMIN", "POST", "masterCollection", ["reports"], { name: "طراحی" }),
          201,
        );
        assert.equal(
          (await call("IT_ADMIN", "POST", "masterCollection", ["reports"], { name: "طراحی" }))
            .status,
          409,
        );
        const off = await data(
          await call("IT_ADMIN", "PATCH", "masterItem", ["reports", report.id], {
            isActive: false,
          }),
        );
        assert.equal(off.isActive, false);
        const edited = await data(
          await call("IT_ADMIN", "PATCH", "masterItem", ["reports", report.id], {
            name: "بررسی",
            isActive: true,
          }),
        );
        assert.equal(edited.name, "بررسی");
      });
      await t.test(
        "LDAP provisioning defaults to EMPLOYEE and sync preserves local permissions/active state",
        async () => {
          const auth = modules(tx).auth;
          const identity = {
            ldapId: "CN=NewEmployee,DC=test",
            username: "new.employee",
            displayName: "New Employee",
            email: null,
          };
          const user = await auth.syncDirectoryUser(identity);
          assert.equal(user.role, "EMPLOYEE");
          assert.equal(user.departmentId, null);
          await tx
            .update(schema.users)
            .set({ role: "BUSINESS_ADMIN", departmentId: department.id, isActive: false })
            .where(eq(schema.users.id, user.id));
          const synced = await auth.syncDirectoryUser({
            ...identity,
            displayName: "Updated Employee",
          });
          assert.equal(synced.role, "BUSINESS_ADMIN");
          assert.equal(synced.departmentId, department.id);
          assert.equal(synced.isActive, false);
          await assert.rejects(auth.createSession(user.id), /Inactive/);
          await tx.update(schema.users).set({ isActive: true }).where(eq(schema.users.id, user.id));
          await auth.createSession(user.id);
          assert.equal((await auth.getCurrentUser()).id, user.id);
          const [row] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id));
          assert.ok(row.lastLoginAt);
          await auth.destroySession();
          assert.equal(await auth.getCurrentUser(), null);
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
