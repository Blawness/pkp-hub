# Mobile Field Mode for Surveyors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman `/dashboard/projects/[id]/field` khusus surveyor di lapangan (ponsel) — menggabungkan kamera dengan auto-EXIF GPS, peta besar, dan tombol status yang besar. Bisa diakses offline; upload antri ke service worker dan sync saat kembali online.

**Architecture:** Route baru di subtree dashboard (RBAC: surveyor, scope `assigned`). Peta yang sudah ada (`peta-map.tsx`) di-reuse, dengan padding lebih besar dan toolbar yang dapat dijangkau jempol. Komponen `<CameraCapture>` baru pakai `<input type="file" capture="environment" accept="image/*">` + `exifr` (baru, 1 dep) untuk baca lat/long. Queue offline pakai IndexedDB (`idb-keyval` baru, 1 dep) yang mengirim ke server saat `navigator.onLine`.

**Tech Stack:** exifr (EXIF), idb-keyval (IndexedDB), service worker manual, shadcn Dialog, next-safe-action, Tailwind responsive utilities.

## Global Constraints

- RBAC: hanya `surveyor` (admin juga boleh untuk QA). `client` tidak boleh akses.
- Tidak menambah dependensi besar: exifr (~30KB gzipped) dan idb-keyval (~600B). Tidak引入 framework service worker baru.
- Service worker TIDAK di-scope ke `/api/*` — server actions tidak bisa di-intercept dengan mudah. Yang kita antri: file upload ke `R2` lewat endpoint upload terpisah (lihat Task 1). Service worker mendaftarkan `fetch` listener untuk endpoint upload tsb.
- iOS Safari 16+ dan Android Chrome terkini: keduanya dukung `capture` attribute dan service worker.
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`. Test: `npm test`.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `app/dashboard/projects/[id]/field/page.tsx` (create) | Server component; gate role + assigned. Render `<FieldShell>`. |
| `components/field/field-shell.tsx` (create) | Layout responsif: peta besar di atas, panel status + kamera di bawah. |
| `components/field/camera-capture.tsx` (create) | `<input capture>` + exifr + tampilkan thumbnail + tombol "Lampirkan ke peta". |
| `components/field/status-buttons.tsx` (create) | Tombol besar (h-14) untuk next status. |
| `components/field/offline-queue.tsx` (create) | Indikator jumlah item antri; tombol "Sinkronkan sekarang". |
| `lib/field/offline-queue.ts` (create) | Helper: tambah ke IndexedDB, list, hapus; baca `navigator.onLine`. |
| `app/api/uploads/photo/route.ts` (create) | POST endpoint untuk upload foto + EXIF metadata (auth required). |
| `lib/actions/documents.ts` (modify) | Tambah `createPhotoFromUpload` yang menerima `{ projectId, storageKey, exif }`. |
| `public/sw.js` (create) | Service worker: cache shell, retry queue. |
| `app/dashboard/layout.tsx` (modify) | Daftarkan service worker (client effect). |
| `lib/rbac/resources/field.ts` (create, atau reuse `map.read`) | Permission untuk akses halaman. |

---

### Task 1: Route + RBAC

**Files:**
- Create: `app/dashboard/projects/[id]/field/page.tsx`

**Interfaces:**
- Page adalah server component.
- `await requireUser()` (sudah ada di layout, tapi page butuh scope row); reuse helper `requireProjectAccessForSurveryor(userId, projectId)` dari `lib/actions/projects-logic.ts` (atau buat jika belum ada).

- [ ] **Step 1: Tulis halaman**

```tsx
// app/dashboard/projects/[id]/field/page.tsx
import { notFound, redirect } from "next/navigation";
import { FieldShell } from "@/components/field/field-shell";
import { getFieldProjectForUser } from "@/lib/actions/field";
import { requireUser } from "@/lib/auth-guards";

export default async function FieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (user.role === "client") redirect("/portal");
  const project = await getFieldProjectForUser(user.id, user.role, id);
  if (!project) notFound();
  return <FieldShell project={project} />;
}
```

- [ ] **Step 2: Logic `getFieldProjectForUser`**

Sama dengan `getProjectForUser` yang ada di `lib/actions/projects-logic.ts`, tapi tanpa field finance (surveyor tidak boleh lihat nilai).

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/projects/[id]/field lib/actions/field.ts
git commit -m "feat(field): route /dashboard/projects/[id]/field for surveyor"
```

---

### Task 2: Camera capture + EXIF

**Files:**
- Create: `components/field/camera-capture.tsx`

- [ ] **Step 1: Install**

```bash
pnpm add exifr
```

- [ ] **Step 2: Komponen**

```tsx
"use client";
import exifr from "exifr";
import { useRef, useState } from "react";

export function CameraCapture({ onCapture }: { onCapture: (file: File, gps: { lat: number; lng: number } | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const exif = await exifr.gps(file).catch(() => null);
          setBusy(false);
          onCapture(file, exif ? { lat: exif.latitude, lng: exif.longitude } : null);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Button size="lg" className="h-14 w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        Ambil Foto
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/field/camera-capture.tsx pnpm-lock.yaml package.json
git commit -m "feat(field): camera capture with EXIF GPS extraction"
```

---

### Task 3: Offline queue + upload endpoint

**Files:**
- Create: `lib/field/offline-queue.ts`
- Create: `app/api/uploads/photo/route.ts`
- Modify: `lib/actions/documents.ts` (tambah `createPhotoFromUpload`)

- [ ] **Step 1: Install**

```bash
pnpm add idb-keyval
```

- [ ] **Step 2: Helper IndexedDB**

```ts
// lib/field/offline-queue.ts
import { del, get, keys, set } from "idb-keyval";
import { createClient } from "@/lib/storage"; // helper R2 — sudah ada

export type QueuedPhoto = {
  id: string;
  projectId: string;
  blob: Blob;
  fileName: string;
  gps: { lat: number; lng: number } | null;
  createdAt: number;
};

export async function enqueuePhoto(p: Omit<QueuedPhoto, "id" | "createdAt">) {
  const id = crypto.randomUUID();
  await set(id, { id, createdAt: Date.now(), ...p });
  return id;
}

export async function listQueue() {
  const allKeys = await keys();
  return Promise.all(allKeys.map((k) => get<QueuedPhoto>(k)));
}

export async function flushQueue() {
  if (!navigator.onLine) return { flushed: 0 };
  const all = await listQueue();
  let flushed = 0;
  for (const item of all) {
    const form = new FormData();
    form.append("file", item.blob, item.fileName);
    form.append("projectId", item.projectId);
    if (item.gps) form.append("lat", String(item.gps.lat));
    if (item.gps) form.append("lng", String(item.gps.lng));
    const res = await fetch("/api/uploads/photo", { method: "POST", body: form });
    if (res.ok) { await del(item.id); flushed++; }
  }
  return { flushed };
}
```

- [ ] **Step 3: API route upload**

```ts
// app/api/uploads/photo/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guards";
import { createPhotoFromUpload } from "@/lib/actions/documents";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user.role === "client") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const projectId = form.get("projectId") as string | null;
  if (!file || !projectId) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const gps = form.get("lat") && form.get("lng")
    ? { lat: Number(form.get("lat")), lng: Number(form.get("lng")) }
    : null;
  const doc = await createPhotoFromUpload({ userId: user.id, role: user.role, projectId, file, gps });
  return NextResponse.json({ ok: true, documentId: doc.id });
}
```

- [ ] **Step 4: `createPhotoFromUpload`**

- Generate storage key via R2 helper.
- Upload.
- Insert `documents` row dengan `category: "foto_lapangan"`.
- Kembalikan id.

- [ ] **Step 5: Test + commit**

```bash
npm test -- lib/field/offline-queue.ts
git add lib/field app/api/uploads pnpm-lock.yaml package.json
git commit -m "feat(field): offline photo queue + upload API"
```

---

### Task 4: Service worker + UI shell

**Files:**
- Create: `public/sw.js`
- Create: `components/field/field-shell.tsx`
- Create: `components/field/status-buttons.tsx`
- Create: `components/field/offline-queue.tsx`
- Modify: `app/dashboard/layout.tsx` (register SW)

- [ ] **Step 1: Service worker minimal**

```js
// public/sw.js
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Background sync — di browser yang support, schedule flush
self.addEventListener("sync", (e) => {
  if (e.tag === "flush-photos") e.waitUntil(self.clients.matchAll().then((c) => c.forEach((x) => x.postMessage({ type: "flush" }))));
});
```

- [ ] **Step 2: Register**

```tsx
// components/field/sw-register.tsx
"use client";
import { useEffect } from "react";
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}
```

Di `app/dashboard/layout.tsx` (client boundary): mount `<SwRegister />` di dalam sebuah component kecil client (atau buat wrapper).

- [ ] **Step 3: Field shell**

Layout:
```
<header> ← judul proyek, status badge
<div className="h-[40vh]"> ← peta (reuse PetaMap)
<CameraCapture />
<StatusButtons />
<OfflineQueue />
```

- [ ] **Step 4: Commit**

```bash
git add public/sw.js components/field app/dashboard/layout.tsx
git commit -m "feat(field): mobile field shell with offline queue UI"
```

---

### Task 5: E2E

- [ ] `e2e/field-mode.spec.ts`:
  - Login surveyor, assign proyek, buka `/dashboard/projects/<id>/field`.
  - Stub kamera (Playwright `setInputFiles` dengan fixture JPEG berisi EXIF).
  - Assert: IndexedDB queue panjang 1 → klik "Sinkronkan" (mode online) → queue kosong + `documents` row baru.

---

## Acceptance Criteria

- [ ] Surveyor bisa mengakses halaman `/dashboard/projects/[id]/field` di mobile.
- [ ] Foto dengan EXIF GPS di-ekstrak dan ditawarkan sebagai pin di peta.
- [ ] Tanpa internet: foto masuk IndexedDB; saat online: flush otomatis (atau manual via tombol).
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e` (filtered) bersih.
