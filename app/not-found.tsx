import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-medium">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Halaman yang Anda cari tidak ada atau sudah dipindahkan.
      </p>
      <ButtonLink href="/">Kembali ke beranda</ButtonLink>
    </main>
  );
}
