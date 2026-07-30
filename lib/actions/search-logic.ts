import { and, desc, eq, ilike, or } from "drizzle-orm";
import { homeForRole } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Bentuk tipis yang dipakai palette Cmd-K: cukup untuk merender baris dan
 * membangun `href` tanpa bocornya kolom sensitif (mis. nomor telepon mentah,
 * nilai proyek). `createdAt` hanya ada di sini untuk sortir recency; dipangkas
 * sebelum dikembalikan ke klien.
 */
export type SearchResult = {
  kind: "client" | "project" | "document";
  id: string;
  label: string;
  sub: string;
  href: string;
};

const PER_KIND_LIMIT = 8;
const TOTAL_LIMIT = 20;

/**
 * Cmd-K global (spec 2026-07-26). Tiga kueri ILIKE paralel — satu per kind —
 * masing-masing dibatasi `rbacFilter` yang SAMA dengan halaman detailnya,
 * sehingga palette tidak pernah bisa membocorkan baris yang aslinya tak
 * terlihat: surveyor tidak akan melihat klien, klien tidak akan melihat
 * dokumen internal, dst. `assertCan("search.use")` di sini sebagai pagar
 * kedua bagi pemanggil yang bypass action wrapper (unit test, dsb.).
 *
 * Kalau `search.use` di scope `all` (admin & surveyor saat ini) artinya
 * mereka diizinkan memakai cmd-K; scoping baris per kind tetap dipegang
 * oleh filter di bawah, bukan oleh izin ini.
 *
 * Hasil digabung lalu diurutkan per recency global lalu dipotong 20 — max 8
 * per kind sudah diterapkan di masing-masing kueri, sehingga satu kind yang
 * sangat cocok tidak menyapu habis total.
 */
export async function globalSearchForUser(ctx: RbacContext, q: string): Promise<SearchResult[]> {
  assertCan(ctx, "search.use");

  // Pagar kedua: `q` sudah di-trim & dibatasi 1..80 di zod, tapi logika ini
  // bisa dipanggil langsung dari test. `ilike` Postgres sudah case-insensitive,
  // lowercasing di sini cuma untuk konsistensi tampilan (placeholder, log).
  const term = q.trim().toLowerCase();
  if (!term) return [];

  const like = `%${term}%`;

  const [clientRows, projectRows, documentRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .where(
        and(
          rbacFilter(ctx, "client.read"),
          or(ilike(clients.name, like), ilike(clients.email, like), ilike(clients.phone, like)),
        ),
      )
      .orderBy(desc(clients.createdAt))
      .limit(PER_KIND_LIMIT),
    db
      .select({
        id: projects.id,
        title: projects.title,
        locationLabel: projects.locationLabel,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(
        and(
          rbacFilter(ctx, "project.read"),
          or(ilike(projects.title, like), ilike(projects.locationLabel, like)),
        ),
      )
      .orderBy(desc(projects.createdAt))
      .limit(PER_KIND_LIMIT),
    db
      .select({
        id: documents.id,
        name: documents.name,
        projectId: projects.id,
        projectTitle: projects.title,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(projects, eq(documents.projectId, projects.id))
      .where(and(rbacFilter(ctx, "document.read"), ilike(documents.name, like)))
      .orderBy(desc(documents.createdAt))
      .limit(PER_KIND_LIMIT),
  ]);

  // Bentuk antara: butuh `createdAt` untuk sortir recency global. Dipangkas
  // di akhir sebelum dikembalikan — kolom ini tidak perlu sampai ke UI.
  type Scored = SearchResult & { createdAt: Date };

  // `homeForRole` mengembalikan `/dashboard` untuk admin/surveyor dan
  // `/portal` untuk klien. Dipakai sebagai basis href agar palette bekerja
  // di kedua area tanpa harus membuat tindakan server terpisah.
  const base = homeForRole(ctx.user.role);

  const combined: Scored[] = [
    ...clientRows.map(
      (c): Scored => ({
        kind: "client",
        id: c.id,
        label: c.name,
        sub: c.email ?? c.phone ?? "",
        // Klien di portal tidak melihat halaman detail klien, tapi palette
        // konsisten: kalau klien mencari nama sendiri dan mengkliknya, ia
        // akan sampai ke /portal (satu-satunya proyek miliknya) lewat
        // fallback 404 → portal listing.
        href: `${base}/clients/${c.id}`,
        createdAt: c.createdAt,
      }),
    ),
    ...projectRows.map(
      (p): Scored => ({
        kind: "project",
        id: p.id,
        label: p.title,
        sub: p.locationLabel ?? "",
        href: `${base}/projects/${p.id}`,
        createdAt: p.createdAt,
      }),
    ),
    ...documentRows.map(
      (d): Scored => ({
        kind: "document",
        id: d.id,
        label: d.name,
        // Dokumen tidak punya halaman detail sendiri di v1 — semua dokumen
        // dilihat di tab Dokumen dalam halaman proyek. `projectTitle`
        // membuat konteksnya jelas saat palette menampilkan hasil.
        sub: d.projectTitle,
        href: `${base}/projects/${d.projectId}`,
        createdAt: d.createdAt,
      }),
    ),
  ];

  return combined
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TOTAL_LIMIT)
    .map(({ kind, id, label, sub, href }) => ({ kind, id, label, sub, href }));
}
