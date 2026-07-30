import { comments } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

/**
 * Komentar proyek — pesan dua arah klien ↔ staf (spec 2026-07-30, F-2025-07-005).
 *
 * Akses komentar MENGIKUTI akses proyek induknya, persis seperti `phase`,
 * `map`, dan `document`: `viaProject(comments.projectId, projectScopes.X)`.
 * Artinya:
 *  - admin (`all`) melihat & menulis di semua proyek
 *  - surveyor (`assigned`) hanya di proyek yang ditugaskan padanya
 *  - client (`own`) hanya di proyek miliknya sendiri
 *
 * Tidak ada `fields` sensitif — `body` boleh dibaca semua pihak yang punya
 * `comment.read`, dan `readByClient`/`readByStaff` bukan data sensitif
 * (hanya penanda UI).
 */
export const commentResource = defineResource({
  name: "comment",
  actions: ["read", "create"],
  table: { table: comments, id: comments.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(comments.projectId, projectScopes.assigned),
    own: viaProject(comments.projectId, projectScopes.own),
  },
});
