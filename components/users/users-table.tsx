import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRowActions } from "@/components/users/user-row-actions";
import type { ManagedUser } from "@/lib/actions/users-logic";
import { roleLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Tabel user. Server Component: tidak memakai <DataTable> karena tiap baris
 * butuh aksi yang bergantung pada siapa yang sedang login dan siapa admin aktif
 * terakhir — keduanya hanya diketahui server, dan mengirimnya ke tabel generik
 * berarti mengirim fungsi lintas batas server/klien.
 */
export function UsersTable({
  rows,
  currentUserId,
  activeAdminCount,
}: {
  rows: ManagedUser[];
  currentUserId: string;
  activeAdminCount: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((user) => {
              const isSelf = user.id === currentUserId;
              // Admin terakhir yang masih aktif tidak boleh diturunkan atau
              // diarsipkan — kalau itu terjadi, tidak ada seorang pun tersisa
              // yang bisa mengangkat admin baru.
              const isLastActiveAdmin =
                user.role === "admin" && !user.archivedAt && activeAdminCount === 1;

              return (
                <TableRow key={user.id} className={cn(user.archivedAt && "opacity-60")}>
                  <TableCell className="font-medium">
                    {user.name}
                    {isSelf ? (
                      <span className="ml-2 text-xs text-muted-foreground">(Anda)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {roleLabel[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.archivedAt ? (
                      <Badge variant="outline">Diarsipkan</Badge>
                    ) : (
                      <Badge variant="secondary">Aktif</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={user}
                      isSelf={isSelf}
                      isLastActiveAdmin={isLastActiveAdmin}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
