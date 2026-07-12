import { env } from "@/env";
import { createLocalDriver } from "./local-driver";
import { createR2Driver } from "./r2-driver";
import type { StorageDriver, StorageDriverName } from "./types";

export type { StorageDriver, StorageDriverName, UploadTarget } from "./types";

/**
 * R2 is used only when ALL five R2 env vars are present; otherwise we fall
 * back to the local `.storage/` driver so dev works without credentials
 * (Phase 4 brief). Exported so it's independently testable without needing
 * a real driver instance.
 */
export function hasR2Config(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );
}

export function selectStorageDriverName(): StorageDriverName {
  return hasR2Config() ? "r2" : "local";
}

function createDriver(): StorageDriver {
  const driver = selectStorageDriverName() === "r2" ? createR2Driver() : createLocalDriver();
  // Log once, at module load, which driver is active — required by the brief.
  console.log(`[storage] using "${driver.name}" driver`);
  return driver;
}

export const storage: StorageDriver = createDriver();
