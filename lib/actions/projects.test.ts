import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listClients } from "@/lib/actions/clients-logic";
import { assignSurveyorForUser, changeProjectStatusForUser } from "@/lib/actions/projects-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database. Exercises the mandatory
 * requirement from the Phase 3 brief: `changeProjectStatus` writes exactly
 * one `projectStatusLogs` row per call (fromStatus/toStatus/actor correct),
 * in the same transaction as the project update, and only the admin or the
 * surveyor ASSIGNED to a project may call it — any other surveyor is
 * rejected via `assertProjectAccess`'s row-level scoping.
 */

let admin: SessionUser;
let surveyorAssigned: SessionUser;
let surveyorOther: SessionUser;
let clientUser: SessionUser;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorAssignedId = randomUUID();
  const surveyorOtherId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Test Admin", email: "test-admin-projects@fixture.test", role: "admin" },
    {
      id: surveyorAssignedId,
      name: "Test Surveyor Assigned",
      email: "test-surveyor-assigned@fixture.test",
      role: "surveyor",
    },
    {
      id: surveyorOtherId,
      name: "Test Surveyor Other",
      email: "test-surveyor-other@fixture.test",
      role: "surveyor",
    },
    {
      id: clientUserId,
      name: "Test Client User",
      email: "test-client-user-projects@fixture.test",
      role: "client",
    },
  ]);

  admin = {
    id: adminId,
    name: "Test Admin",
    email: "test-admin-projects@fixture.test",
    role: "admin",
  };
  surveyorAssigned = {
    id: surveyorAssignedId,
    name: "Test Surveyor Assigned",
    email: "test-surveyor-assigned@fixture.test",
    role: "surveyor",
  };
  surveyorOther = {
    id: surveyorOtherId,
    name: "Test Surveyor Other",
    email: "test-surveyor-other@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Test Client User",
    email: "test-client-user-projects@fixture.test",
    role: "client",
  };

  const [client] = await db
    .insert(clients)
    .values({ name: "Fixture Client", type: "individual" })
    .returning();
  clientId = client.id;

  const [project] = await db
    .insert(projects)
    .values({
      title: "Fixture Project",
      clientId: client.id,
      surveyType: "batas_tanah",
      assignedSurveyorId: surveyorAssignedId,
      status: "baru",
    })
    .returning();
  projectId = project.id;
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("changeProjectStatusForUser", () => {
  it("a surveyor NOT assigned to the project cannot change its status", async () => {
    await expect(
      changeProjectStatusForUser(surveyorOther, { projectId, toStatus: "dijadwalkan" }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row.status).toBe("baru");

    const logs = await db
      .select()
      .from(projectStatusLogs)
      .where(eq(projectStatusLogs.projectId, projectId));
    expect(logs).toHaveLength(0);
  });

  it("the assigned surveyor CAN change its status, writing exactly one log row", async () => {
    const updated = await changeProjectStatusForUser(surveyorAssigned, {
      projectId,
      toStatus: "dijadwalkan",
    });
    expect(updated.status).toBe("dijadwalkan");

    const logs = await db
      .select()
      .from(projectStatusLogs)
      .where(eq(projectStatusLogs.projectId, projectId));
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe("baru");
    expect(logs[0].toStatus).toBe("dijadwalkan");
    expect(logs[0].changedById).toBe(surveyorAssigned.id);
  });

  it("the admin can change status too, adding a second, distinct log row", async () => {
    const updated = await changeProjectStatusForUser(admin, {
      projectId,
      toStatus: "data_diambil",
    });
    expect(updated.status).toBe("data_diambil");

    const logs = await db
      .select()
      .from(projectStatusLogs)
      .where(eq(projectStatusLogs.projectId, projectId));
    expect(logs).toHaveLength(2);
    const latest = logs.find((l) => l.toStatus === "data_diambil");
    expect(latest?.fromStatus).toBe("dijadwalkan");
    expect(latest?.changedById).toBe(admin.id);
  });
});

/**
 * Phase 3 review fix: `changeProjectStatusForUser` used to accept ANY
 * `toStatus` from an authorized caller, so a surveyor could drag a
 * `selesai` project back to `baru` through the real UI (PRD §3 Feature 2
 * violation). Each test below uses its own fixture project (via
 * `insertFixtureProject`) so they're independent of the mutable
 * `projectId` fixture used above.
 */
async function insertFixtureProject(status: (typeof projects.$inferInsert)["status"]) {
  const [project] = await db
    .insert(projects)
    .values({
      title: `Pipeline Fixture (${status})`,
      clientId,
      surveyType: "batas_tanah",
      assignedSurveyorId: surveyorAssigned.id,
      status,
    })
    .returning();
  return project.id;
}

describe("changeProjectStatusForUser: status transition table", () => {
  it("the assigned surveyor CAN move exactly one step forward", async () => {
    const id = await insertFixtureProject("baru");
    const updated = await changeProjectStatusForUser(surveyorAssigned, {
      projectId: id,
      toStatus: "dijadwalkan",
    });
    expect(updated.status).toBe("dijadwalkan");
  });

  it("a surveyor CANNOT skip a step forward (baru -> selesai)", async () => {
    const id = await insertFixtureProject("baru");
    await expect(
      changeProjectStatusForUser(surveyorAssigned, { projectId: id, toStatus: "selesai" }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row.status).toBe("baru");
  });

  it("a surveyor CANNOT cancel a project (admin-only)", async () => {
    const id = await insertFixtureProject("baru");
    await expect(
      changeProjectStatusForUser(surveyorAssigned, { projectId: id, toStatus: "dibatalkan" }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row.status).toBe("baru");
  });

  it("a surveyor CANNOT move a `selesai` project backward or reopen it — the exact bug found in review", async () => {
    const id = await insertFixtureProject("selesai");

    await expect(
      changeProjectStatusForUser(surveyorAssigned, { projectId: id, toStatus: "diproses" }),
    ).rejects.toThrow();
    await expect(
      changeProjectStatusForUser(surveyorAssigned, { projectId: id, toStatus: "baru" }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row.status).toBe("selesai");
  });

  it("the admin CAN cancel a project", async () => {
    const id = await insertFixtureProject("baru");
    const updated = await changeProjectStatusForUser(admin, {
      projectId: id,
      toStatus: "dibatalkan",
    });
    expect(updated.status).toBe("dibatalkan");
  });

  it("the admin CAN reopen a `selesai` project back to `diproses`", async () => {
    const id = await insertFixtureProject("selesai");
    const updated = await changeProjectStatusForUser(admin, {
      projectId: id,
      toStatus: "diproses",
    });
    expect(updated.status).toBe("diproses");
  });

  it("the admin CAN reactivate a `dibatalkan` project back to `baru`", async () => {
    const id = await insertFixtureProject("dibatalkan");
    const updated = await changeProjectStatusForUser(admin, {
      projectId: id,
      toStatus: "baru",
    });
    expect(updated.status).toBe("baru");
  });
});

describe("assignSurveyorForUser", () => {
  it("rejects assigning a user whose role is not `surveyor`", async () => {
    const id = await insertFixtureProject("baru");
    await expect(
      assignSurveyorForUser(admin, { projectId: id, surveyorId: clientUser.id }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row.assignedSurveyorId).toBe(surveyorAssigned.id);
  });

  it("accepts assigning a valid surveyor", async () => {
    const id = await insertFixtureProject("baru");
    const updated = await assignSurveyorForUser(admin, {
      projectId: id,
      surveyorId: surveyorOther.id,
    });
    expect(updated.assignedSurveyorId).toBe(surveyorOther.id);
  });
});

describe("new-project client options exclude archived clients", () => {
  it("archived clients are absent from `listClients()`, which backs the new-project dropdown", async () => {
    const [freshClient] = await db
      .insert(clients)
      .values({ name: "Archived Client Fixture", type: "individual" })
      .returning();
    await db.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, freshClient.id));

    const selectable = await listClients();
    expect(selectable.some((c) => c.id === freshClient.id)).toBe(false);

    const withArchived = await listClients({ includeArchived: true });
    expect(withArchived.some((c) => c.id === freshClient.id)).toBe(true);
  });
});
