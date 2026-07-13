"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { Fragment } from "react";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { buildLinks } from "@/components/dashboard/nav-config";
import type { SessionUser } from "@/lib/auth-guards";

/** Segmen aksi yang punya nama sendiri; sisanya dianggap id. */
const ACTION_LABELS: Record<string, string> = {
  new: "Baru",
  edit: "Edit",
  users: "User",
};

type Crumb = { key: string; label: string; href?: string };

/**
 * Membangun breadcrumb dari segmen route aktif.
 *
 * Segmen dinamis ([id]) sengaja TIDAK ditampilkan apa adanya: nilainya UUID,
 * dan "Proyek › 5f2c1a3e-…" tidak memberi tahu pengguna apa pun. Judul entitas
 * yang sebenarnya hanya diketahui server, sementara komponen ini harus berupa
 * Client Component untuk membaca segmen — jadi id dipetakan ke "Detail", dan
 * judul asli tetap tampil sebagai <h1> di halamannya sendiri.
 */
function buildCrumbs(segments: string[], user: SessionUser): Crumb[] {
  const crumbs: Crumb[] = [{ key: "/dashboard", label: "Dashboard", href: "/dashboard" }];
  if (segments.length === 0) return crumbs;

  const [section, ...rest] = segments;
  const sectionPath = `/dashboard/${section}`;
  const link = buildLinks(user.role).find((l) => l.segment === section);
  crumbs.push({
    key: sectionPath,
    label: link?.label ?? section,
    href: rest.length > 0 ? (link?.href ?? sectionPath) : undefined,
  });

  for (const [index, segment] of rest.entries()) {
    const isLast = index === rest.length - 1;
    // Kunci diambil dari path kumulatif, bukan indeks: dua remah bisa sama-sama
    // berlabel "Detail", tapi path-nya tidak pernah sama.
    const path = `${sectionPath}/${rest.slice(0, index + 1).join("/")}`;
    crumbs.push({
      key: path,
      label: ACTION_LABELS[segment] ?? "Detail",
      // Hanya remah terakhir yang tanpa tautan (ia halaman saat ini).
      href: isLast ? undefined : path,
    });
  }

  return crumbs;
}

export function Topbar({ user }: { user: SessionUser }) {
  const segments = useSelectedLayoutSegments();
  const crumbs = buildCrumbs(segments, user);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <MobileNav user={user} />

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={crumb.key}>
                {index > 0 ? (
                  <ChevronRightIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground/50"
                  />
                ) : null}
                <li className="min-w-0">
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className="truncate font-medium"
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
