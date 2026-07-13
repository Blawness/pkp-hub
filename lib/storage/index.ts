import { env } from "@/env";
import { createLocalDriver } from "./local-driver";
import { createR2Driver } from "./r2-driver";
import type { StorageDriver, StorageDriverName } from "./types";

export type { StorageDriver, StorageDriverName, UploadTarget } from "./types";

/** Hanya bagian env yang menentukan pilihan driver. */
export type R2Config = {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
};

/**
 * R2 dipakai hanya kalau KEEMPAT var-nya ada; kalau tidak, jatuh ke driver
 * `.storage/` lokal supaya dev jalan tanpa kredensial (Phase 4 brief).
 *
 * Dulu ada var kelima, `R2_PUBLIC_URL`. Ia dibuang: sejak unduhan memakai
 * presigned URL (`downloadUrlFor`), tidak ada yang membacanya — tapi ia tetap
 * ikut menentukan driver, jadi satu var yang lupa diisi diam-diam melempar
 * PRODUKSI ke disk ephemeral Vercel dan menghilangkan dokumen. Var yang tidak
 * dipakai tapi bisa menjatuhkan produksi adalah jebakan, bukan konfigurasi.
 *
 * `config` disuntikkan supaya bisa diuji tanpa bergantung pada env ambient —
 * versi sebelumnya membaca `env` langsung, jadi test-nya lulus hanya selama
 * `.env.local` kebetulan tidak punya kredensial R2.
 */
export function hasR2Config(config: R2Config = env): boolean {
  return Boolean(
    config.R2_ACCOUNT_ID &&
      config.R2_ACCESS_KEY_ID &&
      config.R2_SECRET_ACCESS_KEY &&
      config.R2_BUCKET,
  );
}

export function selectStorageDriverName(config: R2Config = env): StorageDriverName {
  return hasR2Config(config) ? "r2" : "local";
}

function createDriver(): StorageDriver {
  const name = selectStorageDriverName();
  const driver = name === "r2" ? createR2Driver() : createLocalDriver();
  // Log once, at module load, which driver is active — required by the brief.
  console.log(`[storage] using "${driver.name}" driver`);

  // The local driver writes to `.storage/` on the local disk. On Vercel
  // serverless that disk is EPHEMERAL — it is reset between invocations and
  // is not shared across instances, so uploaded files silently vanish. This
  // must never be the production driver. We only warn (not throw) so a
  // preview deploy without R2 credentials configured yet can still boot;
  // see DEPLOY.md for the required R2_* env vars.
  if (name === "local" && process.env.NODE_ENV === "production") {
    console.warn(
      "\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
        "!! [storage] WARNING: local disk driver selected in production.   !!\n" +
        "!! `.storage/` is EPHEMERAL on Vercel — uploaded files WILL BE     !!\n" +
        "!! LOST. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,                     !!\n" +
        "!! R2_SECRET_ACCESS_KEY, and R2_BUCKET to enable the R2 driver     !!\n" +
        "!! before relying on document uploads. See DEPLOY.md.             !!\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n",
    );
  }

  return driver;
}

export const storage: StorageDriver = createDriver();

/**
 * URL yang boleh diserahkan ke browser untuk melihat / mengunduh satu objek.
 *
 * SELALU pakai ini — jangan pernah menyerahkan `documents.fileUrl` mentah ke
 * klien. `fileUrl` adalah alamat objek di R2, dan bucket-nya PRIVAT, jadi URL
 * itu tidak bisa dibuka siapa pun tanpa tanda tangan. Membuatnya bisa dibuka
 * berarti mempublikkan bucket — dan itu membuat SETIAP dokumen (termasuk yang
 * `sharedWithClient: false`) bisa diunduh siapa saja yang tahu URL-nya, tanpa
 * login. Dokumen survey klien tidak boleh begitu.
 *
 * - driver r2   : presigned GET, berlaku 1 jam.
 * - driver lokal: `/api/storage/<key>`, rute yang sudah menegakkan
 *   `assertProjectAccess` + aturan `sharedWithClient` untuk peran klien.
 *
 * Ini BUKAN batas keamanan: ia menandatangani apa pun yang diberikan padanya.
 * Pemanggil wajib sudah menyaring baris sesuai hak akses pengguna — dan itulah
 * yang dilakukan `documents-logic.ts` (listDocumentsForProject,
 * listSharedDocumentsForProject, searchDocumentsForUser).
 */
export function downloadUrlFor(fileUrl: string): Promise<string> {
  return storage.getSignedUrl(storage.keyFromUrl(fileUrl));
}
