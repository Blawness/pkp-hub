import type { Permission } from "./resources";
import type { RbacContext, Scope } from "./types";

/** Boleh melakukan aksi ini sama sekali? Tidak melihat baris mana pun. */
export function can(ctx: RbacContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Jangkauan baris untuk izin ini, atau null kalau tidak punya izinnya. */
export function scopeOf(ctx: RbacContext, permission: Permission): Scope | null {
  return ctx.permissions.get(permission) ?? null;
}

/** Versi `can` yang melempar. Pesannya ditampilkan apa adanya ke user. */
export function assertCan(ctx: RbacContext, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new Error("Anda tidak punya izin untuk melakukan tindakan ini.");
  }
}
