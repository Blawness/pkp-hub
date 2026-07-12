import { requireStaff } from "@/lib/auth-guards";

export default async function DashboardPage() {
  const user = await requireStaff();
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {user.name} ({user.role}).
      </p>
    </main>
  );
}
