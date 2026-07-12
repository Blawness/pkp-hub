import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertProjectAccess, requireStaff, requireUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { readLocalFile } from "@/lib/storage/local-driver";

/**
 * Serves (GET) and accepts (PUT) object bytes for the LOCAL storage driver
 * only (Phase 4 brief — dev fallback when R2 env vars are absent). When the
 * r2 driver is active this route 404s: R2 objects are uploaded to /
 * downloaded from R2 directly via presigned URLs, never through the app.
 *
 * Both verbs re-derive the owning project from the key
 * (`documents/<projectId>/...`) and go through `assertProjectAccess` — the
 * same scoping boundary as everywhere else. GET additionally enforces that
 * a `client` role may only read documents explicitly `sharedWithClient`.
 */

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  csv: "text/csv",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** `documents/<projectId>/<rest...>` -> `<projectId>`, else null for a malformed key. */
function projectIdFromKey(key: string): string | null {
  const [prefix, projectId] = key.split("/");
  return prefix === "documents" && projectId ? projectId : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storage.name !== "local") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  const user = await requireUser();
  const projectId = projectIdFromKey(key);
  if (!projectId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await assertProjectAccess(projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (user.role === "client") {
    const [doc] = await db
      .select({ sharedWithClient: documents.sharedWithClient })
      .from(documents)
      .where(eq(documents.fileUrl, `/api/storage/${key}`));
    if (!doc?.sharedWithClient) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  try {
    const buffer = await readLocalFile(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": guessContentType(key),
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storage.name !== "local") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  const user = await requireStaff();
  const projectId = projectIdFromKey(key);
  if (!projectId) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  try {
    await assertProjectAccess(projectId, user);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  const url = await storage.put(key, bytes, contentType);
  return NextResponse.json({ url });
}
