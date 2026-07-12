import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeProjectStatusForUser } from "@/lib/actions/projects-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database. Exercises the mandatory
 * requirement from the Phase 3 brief: `changeProjectStatus` writes exactly
 * one `projectStatusLogs` row per call (fromStatus/toStatus/actor correct),
 * in the same transaction as the project update, and only the owner or the
 * surveyor ASSIGNED to a project may call it — any other surveyor is
 * rejected via `assertProjectAccess`'s row-level scoping.
 */

let owner: SessionUser;
let surveyorAssigned: SessionUser;
let surveyorOther: SessionUser;
let projectId: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const ownerId = randomUUID();
  const surveyorAssignedId = randomUUID();
  const surveyorOtherId = randomUUID();

  await db.insert(users).values([
    { id: ownerId, name: "Test Owner", email: "test-owner-projects@fixture.test", role: "owner" },
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
  ]);

  owner = {
    id: ownerId,
    name: "Test Owner",
    email: "test-owner-projects@fixture.test",
    role: "owner",
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

  const [client] = await db
    .insert(clients)
    .values({ name: "Fixture Client", type: "individual" })
    .returning();

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

  it("the owner can change status too, adding a second, distinct log row", async () => {
    const updated = await changeProjectStatusForUser(owner, {
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
    expect(latest?.changedById).toBe(owner.id);
  });
});
