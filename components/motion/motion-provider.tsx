"use client";

import { MotionConfig } from "motion/react";

/**
 * Kebijakan motion untuk seluruh aplikasi.
 *
 * `reducedMotion="user"` membuat `motion` membaca `prefers-reduced-motion`
 * milik OS dan membuang animasi transform (translate/scale/rotate) sambil
 * MEMPERTAHANKAN animasi opacity. Itu persis kebijakan yang kita mau:
 * mematikan segalanya justru membuat konten melompat, yang lebih buruk
 * daripada gerakan halus.
 *
 * Jangan mendeteksi `prefers-reduced-motion` sendiri di komponen — cukup
 * pakai primitif di `components/motion/`, dan kebijakan ini berlaku otomatis.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
