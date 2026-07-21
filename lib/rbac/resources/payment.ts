import { payments } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const paymentResource = defineResource({
  name: "payment",
  actions: ["read", "record", "void", "regenerateReceipt"],
  table: { table: payments, id: payments.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(payments.projectId, projectScopes.assigned),
    own: viaProject(payments.projectId, projectScopes.own),
  },
});
