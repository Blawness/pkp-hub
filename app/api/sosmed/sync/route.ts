import { env } from "@/env";
import { applySyncPayload } from "@/lib/sosmed/sync-logic";
import { syncPayloadSchema, tokenMatches } from "@/lib/sosmed/sync-schemas";

/**
 * `POST /api/sosmed/sync` — satu-satunya pintu masuk data pipeline sosmed ke Hub.
 *
 * Bukan server action: pemanggilnya proses CLI di mesin lain (pipeline lokal),
 * bukan browser dengan sesi user. Karena itu auth-nya token mesin
 * (`SOSMED_SYNC_TOKEN`), bukan `getRbacContext()`. Token kosong = route mati
 * (fail-closed), bukan "terbuka karena belum diisi".
 *
 * Urutan cek: token → body JSON → skema. Token dicek lebih dulu supaya
 * penelepon anonim tidak bisa memakai beda 400/422 untuk memetakan kontrak
 * payload.
 */
export async function POST(request: Request) {
  const token = env.SOSMED_SYNC_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Sync belum dikonfigurasi: SOSMED_SYNC_TOKEN kosong." },
      { status: 503 },
    );
  }
  if (!tokenMatches(request.headers.get("authorization"), token)) {
    return Response.json({ error: "Token sync tidak sah." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON valid." }, { status: 400 });
  }

  const parsed = syncPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload sync tidak sesuai skema.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await applySyncPayload(parsed.data);
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error("[sosmed] sync gagal:", error);
    return Response.json({ error: "Sync gagal disimpan." }, { status: 500 });
  }
}
