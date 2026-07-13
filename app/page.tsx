import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, homeForRole } from "@/lib/auth-guards";

const LAYANAN = ["Survey topografi", "Pengukuran lahan", "Pemetaan digital"];

const AREA = [
  {
    nama: "Area Staf",
    untuk: "Owner & surveyor",
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
      {/* Panel brand. Tekstur grid-nya CSS murni — tidak ada aset gambar. */}
      <div
        className="relative flex flex-col justify-between overflow-hidden bg-brand-base px-8 py-10 text-white lg:px-12 lg:py-14"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        {/* Cahaya aksen di sudut, biar grid-nya tidak terbaca rata seperti kertas milimeter. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--brand-accent)" }}
        />

        <div className="relative">
          <p className="font-heading text-xl font-semibold tracking-tight">PKP Hub</p>
          <p className="mt-1 text-sm text-white/60">Presisi Konsulindo Prima</p>
        </div>

        <div className="relative mt-10 lg:mt-0">
          <p className="font-heading text-2xl leading-snug font-medium text-balance lg:text-3xl">
            Presisi dalam setiap ukuran.
          </p>
          <ul className="mt-6 space-y-2.5">
            {LAYANAN.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-white/70">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 text-xs text-white/40 lg:mt-0">
          © {new Date().getFullYear()} Presisi Konsulindo Prima
        </p>
      </div>

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

          <Button className="mt-8 w-full" size="lg" render={<Link href="/login">Masuk</Link>} />

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
