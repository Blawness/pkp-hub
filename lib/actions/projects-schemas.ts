import { z } from "zod";

/**
 * Shared zod schemas for project CRUD + status pipeline. Not a "use server"
 * module — plain schema/type definitions consumed by both
 * `projects-logic.ts` (server-only business logic, directly unit-testable)
 * and `projects.ts` (the "use server" action wrappers).
 */
export const surveyTypeEnum = z.enum([
  "topografi",
  "kavling",
  "batas_tanah",
  "luas_bangunan",
  "lainnya",
]);

export const projectStatusEnum = z.enum([
  "baru",
  "dijadwalkan",
  "data_diambil",
  "diproses",
  "selesai",
  "dibatalkan",
]);

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi."),
  clientId: z.uuid(),
  surveyType: surveyTypeEnum,
  locationLabel: z.string().trim().optional(),
  assignedSurveyorId: z.union([z.string(), z.literal("")]).optional(),
  orderDate: z.string().trim().optional(),
  description: z.string().trim().optional(),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const updateProjectInputSchema = projectInputSchema.extend({ id: z.uuid() });
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const assignSurveyorInputSchema = z.object({
  projectId: z.uuid(),
  surveyorId: z.union([z.string(), z.literal("")]).optional(),
});
export type AssignSurveyorInput = z.infer<typeof assignSurveyorInputSchema>;

export const changeProjectStatusInputSchema = z.object({
  projectId: z.uuid(),
  toStatus: projectStatusEnum,
});
export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusInputSchema>;
