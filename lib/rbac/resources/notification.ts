import { defineResource } from "../define-resource";

/**
 * Kelola template & kirim notifikasi — admin + superuser.
 * Table-less; action-nya query `lib/notifications/` yang sudah ada.
 */
export const notificationResource = defineResource({
  name: "notification",
  actions: ["manage"],
});
