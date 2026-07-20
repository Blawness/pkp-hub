"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { Fragment } from "react";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { buildCrumbs } from "@/components/dashboard/nav-config";
import type { SessionUser } from "@/lib/auth-guards";

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
