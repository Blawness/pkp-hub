import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { defineResource } from "@/lib/rbac/define-resource";
import { highestScope } from "@/lib/rbac/types";

describe("highestScope", () => {
  it("memilih scope terluas", () => {
    expect(highestScope("own", "all")).toBe("all");
    expect(highestScope("all", "own")).toBe("all");
    expect(highestScope("own", "assigned")).toBe("assigned");
    expect(highestScope("assigned", "assigned")).toBe("assigned");
  });
});

describe("defineResource", () => {
  it("menurunkan daftar permission dari nama + actions", () => {
    const resource = defineResource({
      name: "demo",
      actions: ["read", "write"],
      scopes: { all: () => sql`true` },
    });

    expect(resource.permissions).toEqual(["demo.read", "demo.write"]);
  });

  it("menolak action ganda", () => {
    expect(() => defineResource({ name: "demo", actions: ["read", "read"] })).toThrow(
      /action ganda/i,
    );
  });

  it("menolak nama resource yang mengandung titik", () => {
    expect(() => defineResource({ name: "de.mo", actions: ["read"] })).toThrow(/titik/i);
  });

  it("menolak action yang mengandung titik", () => {
    expect(() => defineResource({ name: "demo", actions: ["re.ad"] })).toThrow(/titik/i);
  });
});
