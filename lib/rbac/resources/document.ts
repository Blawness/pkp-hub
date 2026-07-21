import { and, eq } from "drizzle-orm";
import { documents } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import type { ScopeFn } from "../types";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

const ownProjectDocuments = viaProject(documents.projectId, projectScopes.own);

/**
 * Client hanya melihat dokumen proyeknya yang SUDAH dibagikan. Syarat
 * tambahan itu tinggal di dalam fungsi scope resource ini — bukan jadi
 * konsep baru di engine.
 */
const ownScope: ScopeFn = (ctx) =>
  and(ownProjectDocuments(ctx), eq(documents.sharedWithClient, true)) as ReturnType<ScopeFn>;

export const documentResource = defineResource({
  name: "document",
  actions: ["read", "upload", "share", "delete"],
  table: { table: documents, id: documents.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(documents.projectId, projectScopes.assigned),
    own: ownScope,
  },
});
