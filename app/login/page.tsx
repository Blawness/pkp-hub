import { Suspense, ViewTransition } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { BrandPanel } from "@/components/brand/brand-panel";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
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
