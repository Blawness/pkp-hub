import { EquipmentForm } from "@/components/equipment/equipment-form";
import { requireAdmin } from "@/lib/auth-guards";

export const metadata = { title: "Alat baru" };

export default async function NewEquipmentPage() {
  await requireAdmin();

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Alat baru</h1>
        <p className="text-sm text-muted-foreground">
          Tambahkan satu unit alat ukur ke inventaris.
        </p>
      </div>
      <EquipmentForm />
    </main>
  );
}
