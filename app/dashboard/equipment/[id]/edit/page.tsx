import { EquipmentForm } from "@/components/equipment/equipment-form";
import { getEquipmentForUser } from "@/lib/actions/equipment-logic";
import type {
  EquipmentCategoryInput,
  EquipmentConditionInput,
} from "@/lib/actions/equipment-schemas";
import { requireAdmin } from "@/lib/auth-guards";
import { downloadUrlFor } from "@/lib/storage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();
  const item = await getEquipmentForUser(user, id);
  return { title: `Edit ${item.name}` };
}

export default async function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();

  // `getEquipmentForUser(admin, ...)` selalu mengembalikan seluruh kolom
  // (termasuk harga & tanggal beli) — halaman ini admin-only, jadi itu benar.
  const item = await getEquipmentForUser(user, id);
  // URL R2 mentah tidak bisa dibuka tanpa tanda tangan — resolve dulu untuk
  // pratinjau di form. Driver lokal mengembalikan URL yang sama.
  const imageDisplayUrl = item.image ? await downloadUrlFor(item.image) : null;

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Edit alat</h1>
        <p className="text-sm text-muted-foreground">{item.name}</p>
      </div>
      <EquipmentForm
        editing={{
          equipmentId: item.id,
          name: item.name,
          category: item.category as EquipmentCategoryInput,
          serialNumber: item.serialNumber,
          condition: item.condition as EquipmentConditionInput,
          image: item.image,
          imageDisplayUrl,
          purchaseDate: "purchaseDate" in item ? item.purchaseDate : null,
          purchasePrice: "purchasePrice" in item ? item.purchasePrice : null,
          notes: item.notes,
        }}
      />
    </main>
  );
}
