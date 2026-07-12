/**
 * Storage driver contract (Phase 4 brief). Two implementations:
 * `r2-driver.ts` (Cloudflare R2, S3-compatible) and `local-driver.ts`
 * (`.storage/` on disk, dev-only). `index.ts` picks one at module load
 * based on whether the R2 env vars are present.
 */
export type StorageDriverName = "r2" | "local";

export type UploadTarget = {
  /** How the client should send the bytes. */
  mode: "presigned" | "direct";
  /** URL the client PUTs the raw file bytes to. */
  uploadUrl: string;
  /** URL the resulting object will be readable/downloadable from afterwards. */
  publicUrl: string;
};

export interface StorageDriver {
  name: StorageDriverName;
  /** Write bytes at `key` directly (used by the local driver's upload route). */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Produce an upload target for `key` — presigned PUT (r2) or a direct route (local). */
  getUploadUrl(key: string, contentType: string): Promise<UploadTarget>;
  /** A signed, time-limited GET URL for the object. */
  getSignedUrl(key: string): Promise<string>;
  /** Remove the object. Safe to call on a missing key. */
  delete(key: string): Promise<void>;
  /** Extract the storage key back out of a `fileUrl` this driver produced. */
  keyFromUrl(fileUrl: string): string;
}
