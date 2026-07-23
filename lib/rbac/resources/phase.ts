import { projectPhases } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const phaseResource = defineResource({
  name: "phase",
  actions: [
    "read",
    "create",
    "update",
    "delete",
    "reorder",
    "setStatus",
    "updateNote",
    "readInternal",
  ],
  table: { table: projectPhases, id: projectPhases.id },
  // Akses fase mengikuti akses proyek induknya — termasuk aturan "ditugaskan
  // ke salah satu fase memberi akses ke seluruh proyek".
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(projectPhases.projectId, projectScopes.assigned),
    own: viaProject(projectPhases.projectId, projectScopes.own),
  },
  // Catatan internal, bobot, dan penanggung jawab dipangkas untuk klien (yang
  // tak punya `phase.readInternal`); staf tetap melihatnya. Portal klien
  // memakai `scopedColumns(phaseResource, ctx)` untuk daftar fasenya.
  fields: {
    description: "phase.readInternal",
    weight: "phase.readInternal",
    assignedSurveyorId: "phase.readInternal",
  },
});
