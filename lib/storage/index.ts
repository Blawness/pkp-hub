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
        "!! LOST. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,                !!\n" +
        "!! R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL to enable    !!\n" +
        "!! the R2 driver before relying on document uploads. See          !!\n" +
        "!! DEPLOY.md for setup steps.                                     !!\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n",
    );
  }

  return driver;
}

export const storage: StorageDriver = createDriver();
