import { ClientForm } from "@/components/clients/client-form";

export const metadata = { title: "Klien baru" };

export default function NewClientPage() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Klien baru</h1>
        <p className="text-sm text-muted-foreground">Tambahkan data klien baru.</p>
      </div>
      <ClientForm />
    </main>
  );
}
