import { mapLayers } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const mapResource = defineResource({
  name: "map",
  actions: ["read", "write"],
  table: { table: mapLayers, id: mapLayers.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(mapLayers.projectId, projectScopes.assigned),
    own: viaProject(mapLayers.projectId, projectScopes.own),
  },
});
