import { redirect } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { BrandPanel } from "@/components/brand/brand-panel";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth-guards";
import { loginDestination } from "@/lib/login-destination";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  // User yang SUDAH ber-sesi tidak boleh disuguhi form login — Chrome suka
  // meng-autocomplete /login?redirectTo=... dari riwayat, dan tanpa bounce ini
  // user mengira sesinya hilang padahal masih sah. Pakai `getSession()` (lookup
  // DB, otoritatif) persis seperti `app/page.tsx`, bukan cookie proxy — jadi
  // tidak mungkin loop redirect: kalau sesi dinyatakan sah di sini, /dashboard
  // atau /portal pasti menerimanya.
  const session = await getSession();
  if (session) {
    const { redirectTo } = await searchParams;
    redirect(
      loginDestination(session.user.role, typeof redirectTo === "string" ? redirectTo : null),
    );
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ViewTransition name="brand-panel">
        <BrandPanel />
      </ViewTransition>

      <div className="flex items-center justify-center px-8 py-14 lg:px-16">
        <Stagger className="w-full max-w-md">
          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle>Masuk ke PKP Hub</CardTitle>
                <CardDescription>
                  Dashboard internal untuk staf, portal untuk klien survey.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* useSearchParams() (untuk `redirectTo`) butuh Suspense boundary. */}
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              </CardContent>
            </Card>
          </Reveal>
        </Stagger>
      </div>
    </main>
  );
}
