import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FeatureCollection } from "geojson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteMapLayerForUser,
  importMapCsvForUser,
  listMapLayersForProject,
  saveMapLayerForUser,
} from "@/lib/actions/maps-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `documents.test.ts`. Exercises the Phase 5 brief's REQUIRED test:
 *  - a surveyor CANNOT save a map layer to a project they are not assigned to
 * plus the rest of the CRUD + CSV import scoping surface.
 */

let admin: SessionUser;
let surveyorAssigned: SessionUser;
let clientA: { id: string };
let clientB: { id: string };
let projectAssigned: string;
let projectOther: string;

const validGeojson: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [106.8, -6.2] },
    },
  ],
};

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

  await db.insert(users).values([
    { id: adminId, name: "Map Test Admin", email: "test-admin-maps@fixture.test", role: "admin" },
    {
      id: surveyorAssignedId,
      name: "Map Test Surveyor Assigned",
      email: "test-surveyor-assigned-maps@fixture.test",
      role: "surveyor",
    },
    {
      id: surveyorOtherId,
      name: "Map Test Surveyor Other",
      email: "test-surveyor-other-maps@fixture.test",
      role: "surveyor",
    },
  ]);

  admin = {
    id: adminId,
    name: "Map Test Admin",
    email: "test-admin-maps@fixture.test",
    role: "admin",
  };
  surveyorAssigned = {
    id: surveyorAssignedId,
    name: "Map Test Surveyor Assigned",
    email: "test-surveyor-assigned-maps@fixture.test",
    role: "surveyor",
  };

  const [ca, cb] = await db
    .insert(clients)
    .values([
      { name: "Map Fixture Client A", type: "individual" },
      { name: "Map Fixture Client B", type: "individual" },
    ])
    .returning();
  clientA = ca;
  clientB = cb;

  const [pAssigned, pOther] = await db
    .insert(projects)
    .values([
      {
        title: "Map Fixture Project (assigned)",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorAssignedId,
        status: "baru",
      },
      {
        title: "Map Fixture Project (other)",
        clientId: clientB.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorOtherId,
        status: "baru",
      },
    ])
    .returning();
  projectAssigned = pAssigned.id;
  projectOther = pOther.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("saveMapLayerForUser", () => {
  it("a surveyor CANNOT save a map layer to a project they are not assigned to", async () => {
    await expect(
      saveMapLayerForUser(surveyorAssigned, {
        projectId: projectOther,
        name: "Batas lahan v1",
        geojson: validGeojson,
        areaSqm: 1000,
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(mapLayers).where(eq(mapLayers.projectId, projectOther));
    expect(rows).toHaveLength(0);
  });

  it("the assigned surveyor CAN save a map layer to their own project", async () => {
    const layer = await saveMapLayerForUser(surveyorAssigned, {
      projectId: projectAssigned,
      name: "Batas lahan v1",
      geojson: validGeojson,
      areaSqm: 1234.5,
    });
    expect(layer.projectId).toBe(projectAssigned);
    expect(layer.source).toBe("manual");
    expect(layer.areaSqm).toBe(1234.5);
  });

  it("a client CANNOT save a map layer at all", async () => {
    const clientUserId = randomUUID();
    await db.insert(users).values({
      id: clientUserId,
      name: "Client User",
      email: "client-maps@fixture.test",
      role: "client",
    });
    const clientUser: SessionUser = {
      id: clientUserId,
      name: "Client User",
      email: "client-maps@fixture.test",
      role: "client",
    };
    await expect(
      saveMapLayerForUser(clientUser, {
        projectId: projectAssigned,
        name: "Illicit layer",
        geojson: validGeojson,
        areaSqm: null,
      }),
    ).rejects.toThrow();
  });
});

describe("importMapCsvForUser: lat/long CSV", () => {
  it("parses, reprojects if needed, stores the raw file, and inserts a mapLayers row with source import_csv", async () => {
    const csvText = [
      "nama,lat,long",
      "A,-6.200000,106.800000",
      "B,-6.200000,106.801000",
      "C,-6.201000,106.801000",
    ].join("\n");

    const result = await importMapCsvForUser(surveyorAssigned, {
      projectId: projectAssigned,
      name: "Import CSV v1",
      csvText,
      utmZone: 48,
      utmHemisphere: "S",
    });

    expect(result.format).toBe("latlong");
    expect(result.pointCount).toBe(3);
    expect(result.layer.source).toBe("import_csv");
    expect(result.layer.rawFileUrl).toBeTruthy();
    expect(result.layer.areaSqm).not.toBeNull();
  });

  it("a surveyor CANNOT import a CSV into a project they are not assigned to", async () => {
    await expect(
      importMapCsvForUser(surveyorAssigned, {
        projectId: projectOther,
        name: "Import CSV",
        csvText: "id,lat,long\n1,-6.2,106.8\n",
        utmZone: 48,
        utmHemisphere: "S",
      }),
    ).rejects.toThrow();
  });
});

describe("importMapCsvForUser: UTM CSV", () => {
  it("reprojects UTM easting/northing with the given zone/hemisphere", async () => {
    const csvText = [
      "id,easting,northing",
      "1,700000,9314000",
      "2,700100,9314000",
      "3,700100,9314100",
    ].join("\n");

    const result = await importMapCsvForUser(admin, {
      projectId: projectAssigned,
      name: "Import UTM v1",
      csvText,
      utmZone: 48,
      utmHemisphere: "S",
    });

    expect(result.format).toBe("utm");
    expect(result.pointCount).toBe(3);
  });
});

describe("listMapLayersForProject", () => {
  it("this test fails if the guard is removed: a surveyor listing a project they don't own is rejected", async () => {
    await expect(listMapLayersForProject(surveyorAssigned, projectOther)).rejects.toThrow();
  });

  it("returns layers for a project the caller can access, newest first", async () => {
    const layers = await listMapLayersForProject(surveyorAssigned, projectAssigned);
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.every((l) => l.projectId === projectAssigned)).toBe(true);
  });
});

describe("deleteMapLayerForUser", () => {
  it("a surveyor CANNOT delete a map layer belonging to a project they aren't assigned to", async () => {
    const [otherLayer] = await db
      .insert(mapLayers)
      .values({
        projectId: projectOther,
        name: "Other project layer",
        geojson: validGeojson,
        source: "manual",
        createdById: admin.id,
      })
      .returning();

    await expect(deleteMapLayerForUser(surveyorAssigned, otherLayer.id)).rejects.toThrow();

    const [stillThere] = await db.select().from(mapLayers).where(eq(mapLayers.id, otherLayer.id));
    expect(stillThere).toBeDefined();
  });

  it("the admin CAN delete a map layer", async () => {
    const [layer] = await db
      .insert(mapLayers)
      .values({
        projectId: projectAssigned,
        name: "To be deleted",
        geojson: validGeojson,
        source: "manual",
        createdById: admin.id,
      })
      .returning();

    await deleteMapLayerForUser(admin, layer.id);
    const [gone] = await db.select().from(mapLayers).where(eq(mapLayers.id, layer.id));
    expect(gone).toBeUndefined();
  });
});
