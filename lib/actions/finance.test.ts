import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updatePaymentForUser } from "@/lib/actions/finance-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `documents.test.ts`. Exercises the phase-6/7 brief's REQUIRED test: a
 * surveyor calling `updatePayment` is rejected (owner-only) — this must
 * fail if the owner-only guard in `finance-logic.ts` is ever removed.
 */

let owner: SessionUser;
let surveyor: SessionUser;
let projectId: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const ownerId = randomUUID();
  const surveyorId = randomUUID();

  await db.insert(users).values([
    {
      id: ownerId,
      name: "Finance Test Owner",
      email: "test-owner-finance@fixture.test",
      role: "owner",
    },
    {
      id: surveyorId,
      name: "Finance Test Surveyor",
      email: "test-surveyor-finance@fixture.test",
      role: "surveyor",
    },
  ]);

  owner = {
    id: ownerId,
    name: "Finance Test Owner",
    email: "test-owner-finance@fixture.test",
    role: "owner",
  };
  surveyor = {
    id: surveyorId,
    name: "Finance Test Surveyor",
    email: "test-surveyor-finance@fixture.test",
    role: "surveyor",
  };

  const [client] = await db
    .insert(clients)
    .values([{ name: "Finance Fixture Client", type: "individual" }])
    .returning();

  const [project] = await db
    .insert(projects)
    .values({
      title: "Finance Fixture Project",
      clientId: client.id,
      surveyType: "batas_tanah",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 1_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = project.id;
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("updatePaymentForUser", () => {
  it("a surveyor CANNOT update payment info, even for their own assigned project", async () => {
    await expect(
      updatePaymentForUser(surveyor, {
        projectId,
        projectValue: 999_999_999,
        paymentStatus: "lunas",
        paymentNotes: "should not apply",
      }),
    ).rejects.toThrow();

    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(row.projectValue).toBe(1_000_000);
    expect(row.paymentStatus).toBe("belum");
  });

  it("the owner CAN update payment info", async () => {
    const updated = await updatePaymentForUser(owner, {
      projectId,
      projectValue: 5_000_000,
      paymentStatus: "lunas",
      paymentNotes: "Lunas via transfer.",
    });
    expect(updated.projectValue).toBe(5_000_000);
    expect(updated.paymentStatus).toBe("lunas");
    expect(updated.paymentNotes).toBe("Lunas via transfer.");
  });

  it("an owner updating a project that does not exist is rejected", async () => {
    await expect(
      updatePaymentForUser(owner, {
        projectId: randomUUID(),
        projectValue: 1,
        paymentStatus: "belum",
      }),
    ).rejects.toThrow();
  });
});
