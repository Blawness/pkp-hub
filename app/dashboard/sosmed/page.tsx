import { CircleAlertIcon, MegaphoneIcon, MessagesSquareIcon, SendIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { socialCommentsColumns } from "@/components/sosmed/social-comments-columns";
import { socialPostsColumns } from "@/components/sosmed/social-posts-columns";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTanggalIndo } from "@/lib/format";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { getSocialSummary, listSocialComments, listSocialPosts } from "@/lib/sosmed/social-logic";

export const metadata = { title: "Sosmed" };

export default async function SosmedPage() {
  const ctx = await getRbacContext();
  // `social.read` hanya admin/superuser. Surveyor yang mengetik URL ini
  // dipantulkan ke dashboard, bukan disuguhi error dari `assertCan`.
  if (!can(ctx, "social.read")) redirect("/dashboard");
  const [posts, comments, summary] = await Promise.all([
    listSocialPosts(ctx),
    listSocialComments(ctx),
    getSocialSummary(ctx),
  ]);

  const published = summary.postsByStatus.published ?? 0;
  const failed = summary.commentsByStatus.failed ?? 0;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Sosmed"
        description="Pantau pipeline postingan dan komentar reachout Instagram yang dikirim pipeline lokal ke Hub."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Postingan tayang"
          value={published}
          hint={`${Object.values(summary.postsByStatus).reduce((a, b) => a + b, 0)} post tercatat`}
          icon={MegaphoneIcon}
        />
        <StatCard
          label="Komentar terkirim"
          value={summary.commentsPosted7d}
          hint="7 hari terakhir"
          icon={SendIcon}
        />
        <StatCard
          label="Menunggu eksekusi"
          value={summary.commentsAwaiting}
          hint="Draf + disetujui, belum dikirim"
          icon={MessagesSquareIcon}
        />
        <StatCard
          label="Gagal kirim"
          value={failed}
          hint={failed > 0 ? "Periksa log pipeline" : "Tidak ada"}
          icon={CircleAlertIcon}
          tone={failed > 0 ? "warning" : "default"}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {summary.lastSync
          ? `Sync terakhir: ${summary.lastSync.handle} (${summary.lastSync.brand.toUpperCase()}) · ${
              summary.lastSync.finishedAt
                ? formatTanggalIndo(summary.lastSync.finishedAt.toISOString().slice(0, 10))
                : "belum selesai"
            } · ${summary.lastSync.postsUpserted} post, ${summary.lastSync.commentsUpserted} komentar.`
          : "Belum pernah ada sync dari pipeline lokal."}
      </p>

      <Tabs defaultValue="postingan">
        <TabsList>
          <TabsTrigger value="postingan">Postingan</TabsTrigger>
          <TabsTrigger value="komentar">Komentar</TabsTrigger>
        </TabsList>

        <TabsContent value="postingan" className="flex flex-col gap-4 pt-4">
          <DataTable
            columns={socialPostsColumns}
            data={posts}
            searchable
            searchPlaceholder="Cari judul postingan…"
            searchStorageKey="sosmed-posts-search"
            emptyMessage={
              <EmptyState
                icon={MegaphoneIcon}
                title="Belum ada postingan tersinkron"
                description="Jalankan perintah hub-sync dari pipeline sosmed untuk mengirim data post ke Hub."
              />
            }
          />
        </TabsContent>

        <TabsContent value="komentar" className="pt-4">
          <DataTable
            columns={socialCommentsColumns}
            data={comments}
            searchable
            searchPlaceholder="Cari akun atau isi balasan…"
            searchStorageKey="sosmed-comments-search"
            emptyMessage={
              <EmptyState
                icon={MessagesSquareIcon}
                title="Belum ada komentar tersinkron"
                description="Komentar balasan dan reachout akan muncul di sini setelah pipeline mengirim data."
              />
            }
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
