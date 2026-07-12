import { notFound } from "next/navigation";
import { ClientForm } from "@/components/clients/client-form";
import { getClientById } from "@/lib/actions/clients-logic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Edit klien</h1>
        <p className="text-sm text-muted-foreground">{client.name}</p>
      </div>
      <ClientForm client={client} />
    </main>
  );
}
