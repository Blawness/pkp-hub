import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageDriver, UploadTarget } from "./types";

/**
 * Dev-only driver: writes to `.storage/` at the repo root (gitignored) and
 * serves files back through `app/api/storage/[...key]/route.ts`. NOT for
 * production — chosen automatically whenever any R2 env var is missing.
 */
const ROOT = resolve(process.cwd(), ".storage");
const LOCAL_PREFIX = "/api/storage/";

/** Resolve `key` to an absolute path under `ROOT`, rejecting path traversal. */
function pathForKey(key: string): string {
  const target = resolve(ROOT, key);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    throw new Error("Invalid storage key.");
  }
  return target;
}

export function createLocalDriver(): StorageDriver {
  return {
    name: "local",
    async put(key, body, _contentType) {
      const filePath = pathForKey(key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      return `${LOCAL_PREFIX}${key}`;
    },
    async getUploadUrl(key, _contentType): Promise<UploadTarget> {
      return {
        mode: "direct",
        uploadUrl: `${LOCAL_PREFIX}${key}`,
        publicUrl: `${LOCAL_PREFIX}${key}`,
      };
    },
    async getSignedUrl(key) {
      // No real signing for the local dev driver — same route serves it back.
      return `${LOCAL_PREFIX}${key}`;
    },
    async delete(key) {
      try {
        await rm(pathForKey(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    keyFromUrl(fileUrl) {
      const idx = fileUrl.indexOf(LOCAL_PREFIX);
      if (idx === -1) throw new Error(`Not a local storage URL: ${fileUrl}`);
      return fileUrl.slice(idx + LOCAL_PREFIX.length);
    },
  };
}

/** Used only by the local upload/download route handlers. */
export async function readLocalFile(key: string): Promise<Buffer> {
  return readFile(pathForKey(key));
}

export function localFilePath(key: string): string {
  return pathForKey(key);
}
