"use client";

import type {
  HookBaseOptions,
  SingleInputActionFn,
  UseActionHookReturn,
} from "next-safe-action/hooks";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

// next-safe-action tidak mengekspor constraint `StandardSchemaV1`, jadi
// tipe generic hook ini diekstrak lewat infer dari alias action-nya.
// biome-ignore lint/suspicious/noExplicitAny: placeholder untuk 4 parameter tipe yang di-infer
type AnyActionFn = SingleInputActionFn<any, any, any, any>;

type ParamsOf<A> =
  A extends SingleInputActionFn<infer SE, infer S, infer SH, infer D>
    ? { se: SE; s: S; sh: SH; d: D }
    : never;

type ServerErrorOf<A> = ParamsOf<A>["se"];
type SchemaOf<A> = ParamsOf<A>["s"];
type ShapedErrorsOf<A> = ParamsOf<A>["sh"];
type DataOf<A> = ParamsOf<A>["d"];

export type ToastActionOptions = {
  /** Pesan sukses kustom. Default: "Berhasil." */
  successMessage?: string;
  /**
   * Bisukan toast sukses (error tetap tampil). Untuk aksi berfrekuensi
   * tinggi yang feedback visualnya sudah jelas, mis. reorder fase atau
   * kirim pesan — toast tiap klik justru berisik.
   */
  silentOnSuccess?: boolean;
};

/** Ambil pesan paling bermakna dari hasil error next-safe-action. */
function extractErrorMessage(error: { serverError?: unknown; validationErrors?: unknown }): string {
  // `handleServerError` di safe-action.ts sudah mengembalikan
  // `error.message` — pesan berbahasa Indonesia dari logic layer.
  if (typeof error.serverError === "string" && error.serverError) return error.serverError;
  if (error.validationErrors && typeof error.validationErrors === "object") {
    for (const value of Object.values(error.validationErrors as Record<string, unknown>)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }
  return "Terjadi kesalahan. Silakan coba lagi.";
}

/**
 * Wrapper `useAction` dengan feedback toast otomatis: sukses → toast hijau,
 * gagal → toast merah berisi pesan error sebenarnya. Callback bawaan
 * (`onSuccess`, `onError`, dst.) tetap dipanggil setelah toast, jadi
 * perilaku existing (refresh, tutup dialog, dll.) tidak berubah.
 *
 * Dipakai sebagai pengganti `useAction` di semua komponen agar setiap
 * mutation punya feedback konsisten tanpa diubah satu-satu.
 */
export function useToastAction<A extends AnyActionFn>(
  action: A,
  opts?: ToastActionOptions &
    HookBaseOptions<ServerErrorOf<A>, SchemaOf<A>, ShapedErrorsOf<A>, DataOf<A>>,
): UseActionHookReturn<ServerErrorOf<A>, SchemaOf<A>, ShapedErrorsOf<A>, DataOf<A>> {
  const { successMessage, silentOnSuccess, ...callbacks } = (opts ?? {}) as ToastActionOptions &
    HookCallbacksLoose;

  return useAction(action, {
    ...callbacks,
    onSuccess: (args) => {
      if (!silentOnSuccess) toast.success(successMessage ?? "Berhasil.");
      return callbacks.onSuccess?.(args);
    },
    onError: (args) => {
      toast.error(extractErrorMessage(args.error));
      return callbacks.onError?.(args);
    },
  } as HookBaseOptions<unknown, undefined, unknown, unknown>) as unknown as UseActionHookReturn<
    ServerErrorOf<A>,
    SchemaOf<A>,
    ShapedErrorsOf<A>,
    DataOf<A>
  >;
}

/**
 * Bentuk longgar untuk destructuring di dalam implementasi — `HookBaseOptions`
 * adalah union (variant `throwOnNavigation`), jadi cast lewat tipe ini lebih
 * aman daripada men-destructure union secara langsung.
 */
type HookCallbacksLoose = {
  onSuccess?: (args: { data: unknown; input: unknown }) => unknown;
  onError?: (args: {
    error: { serverError?: unknown; validationErrors?: unknown };
    input: unknown;
  }) => unknown;
  onExecute?: (args: { input: unknown }) => unknown;
  onSettled?: (args: { result: unknown; input: unknown }) => unknown;
  onNavigation?: (args: { input: unknown; navigationKind: unknown }) => unknown;
  throwOnNavigation?: boolean;
};
