import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveClientForUser,
  createClientForUser,
  listClients,
} from "@/lib/actions/clients-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database: wipes the app tables, inserts a
 * deterministic fixture, exercises `clients-logic.ts`'s role checks + soft
 * delete, then restores the canonical dev seed.
 */

let admin: SessionUser;
let surveyor: SessionUser;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Test Admin", email: "test-admin-clients@fixture.test", role: "admin" },
    {
      id: surveyorId,
      name: "Test Surveyor",
      email: "test-surveyor-clients@fixture.test",
      role: "surveyor",
    },
  ]);

  admin = {
    id: adminId,
    name: "Test Admin",
    email: "test-admin-clients@fixture.test",
    role: "admin",
  };
  surveyor = {
    id: surveyorId,
    name: "Test Surveyor",
    email: "test-surveyor-clients@fixture.test",
    role: "surveyor",
  };
});

afterAll(() => {
  // Restore the canonical dev seed so demo data is left intact for manual use.
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("createClientForUser", () => {
  it("admin can create a client", async () => {
    const client = await createClientForUser(admin, {
      name: "Fixture Client",
      type: "individual",
    });
    expect(client.name).toBe("Fixture Client");
    expect(client.archivedAt).toBeNull();
  });

  it("a surveyor calling createClient is rejected", async () => {
    await expect(
      createClientForUser(surveyor, { name: "Should Not Exist", type: "individual" }),
    ).rejects.toThrow();

    const rows = await db.select().from(clients);
    expect(rows.some((c) => c.name === "Should Not Exist")).toBe(false);
  });
});

describe("archiveClientForUser", () => {
  it("sets archivedAt, hides from the default list, but the row still exists", async () => {
    const created = await createClientForUser(admin, {
      name: "To Be Archived",
      type: "company",
    });

    const archived = await archiveClientForUser(admin, { id: created.id });
    expect(archived.archivedAt).not.toBeNull();

    const defaultList = await listClients();
    expect(defaultList.some((c) => c.id === created.id)).toBe(false);

    const withArchived = await listClients({ includeArchived: true });
    expect(withArchived.some((c) => c.id === created.id)).toBe(true);

    const [stillInDb] = await db.select().from(clients).where(eq(clients.id, created.id));
    expect(stillInDb).toBeDefined();
  });
});
