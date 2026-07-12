import { requireClient } from "@/lib/auth-guards";

export default async function PortalPage() {
  const user = await requireClient();
  return (
    <main className="p-8">
      <h1 className="text-xl font-medium">Client Portal</h1>
      <p className="text-sm text-muted-foreground">Signed in as {user.name}.</p>
    </main>
  );
}
