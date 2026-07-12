import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>Finish setting up your PKP Hub client portal account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
