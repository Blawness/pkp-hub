"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { UsageHistoryRow } from "@/components/equipment/usage-history";
import { getEquipmentForUser, listUsageForEquipment } from "@/lib/actions/equipment-logic";
import { rbacActionClient } from "@/lib/actions/safe-action";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
import { optionalDisplayUrlFor } from "@/lib/storage";

/**
 * Server action untuk modal detail unit (spesifikasi 2026-07-30). Dipanggil
 * dari klien via `useAction` saat modal dibuka — bukan saat halaman dirender,
 * supaya payload awal halaman tetap kecil (daftar unit saja). Hasilnya
 * identik dengan apa yang `unit/[unitId]/page.tsx` render, minus header/
 * navigasi page-level.
 *
 * Modul ini dipisah dari `equipment.ts` (yang berisi mutasi) supaya alur
 * query → action client → render modal punya satu rumah dan tidak
 * mengotori file mutasi.
 */

const inputSchema = z.object({ unitId: z.uuid() });

export const getEquipmentDetail = rbacActionClient
  .metadata({ permission: "equipment.read" })
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await getEquipmentForUser(ctx.rbac, parsedInput.unitId);
    const usages = await listUsageForEquipment(ctx.rbac, parsedInput.unitId);
    const imageDisplayUrl = item.image ? await optionalDisplayUrlFor(item.image) : null;

    // join nama proyek & surveyor untuk riwayat pakai — sama persis dengan
    // yang halaman detail lakukan, supaya modal benar-benar reuse konten.
    const projectIds = [...new Set(usages.map((u) => u.projectId))];
    const userIds = [...new Set(usages.map((u) => u.usedById))];

    const [projectRows, userRows] = await Promise.all([
      projectIds.length
        ? db
            .select({ id: projects.id, title: projects.title })
            .from(projects)
            .where(inArray(projects.id, projectIds))
        : Promise.resolve([] as { id: string; title: string }[]),
      userIds.length
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, userIds))
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);

    const projectTitleById = new Map(projectRows.map((p) => [p.id, p.title]));
    const userNameById = new Map(userRows.map((u) => [u.id, u.name]));

    const now = new Date();
    const isAdmin = ctx.rbac.user.role === "admin";
    const usageRows: UsageHistoryRow[] = usages.map((usage) => ({
      id: usage.id,
      projectId: usage.projectId,
      projectTitle: projectTitleById.get(usage.projectId) ?? "—",
      usedByName: userNameById.get(usage.usedById) ?? "—",
      startedAt: usage.startedAt,
      endedAt: usage.endedAt,
      // Durasi tetap dihitung di server — lihat komentar di usage-history.tsx
      // soal mismatch hidrasi.
      duration: formatDuration(usageDurationMs(usage, now)),
      note: usage.note,
      canReturn: usage.endedAt === null && (isAdmin || usage.usedById === ctx.rbac.user.id),
    }));

    const activeDuration = item.activeUsage
      ? formatDuration(
          usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now),
        )
      : null;

    return {
      success: true as const,
      item,
      imageDisplayUrl,
      usageRows,
      activeDuration,
    };
  });
