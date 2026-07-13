import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { BrandPanel } from "@/components/brand/brand-panel";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, homeForRole } from "@/lib/auth-guards";

const AREA = [
  {
    nama: "Area Staf",
    untuk: "Admin & surveyor",
    deskripsi: "Kelola proyek, penugasan surveyor, dokumen, dan invoice.",
  },
  {
    nama: "Portal Klien",
    untuk: "Klien survey",
    deskripsi: "Pantau progres proyek dan unduh dokumen hasil pengukuran.",
  },
];

/**
 * Gerbang internal. Pengunjung anonim melihat halaman ini; user yang sudah
 * login langsung dilempar ke areanya sendiri — root URL bukan tempat kerja
 * siapa pun.
 *
 * Redirect di sini murni kenyamanan, BUKAN batas keamanan: yang menjaga
 * `/dashboard` dan `/portal` tetap helper di `lib/auth-guards.ts`. Halaman ini
 * sendiri tidak menyentuh data proyek maupun klien.
 */
export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(homeForRole(session.user.role));
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ViewTransition name="brand-panel">
        <BrandPanel />
      </ViewTransition>

      {/* Panel aksi. */}
      <div className="flex items-center justify-center px-8 py-14 lg:px-16">
        <div className="w-full max-w-md">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            Selamat datang di PKP Hub
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Dashboard manajemen survey &amp; pengukuran. Masuk dengan akun yang sudah terdaftar
            untuk melanjutkan.
          </p>

          <ButtonLink className="mt-8 w-full" size="lg" href="/login">
            Masuk
          </ButtonLink>

          <div className="mt-10 space-y-3">
            {AREA.map((area) => (
              <Card key={area.nama}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    {area.nama}
                    <span className="text-xs font-normal text-muted-foreground">{area.untuk}</span>
                  </CardTitle>
                  <CardDescription>{area.deskripsi}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Area Anda ditentukan otomatis oleh role akun setelah masuk.
          </p>
        </div>
      </div>
    </main>
  );
}
