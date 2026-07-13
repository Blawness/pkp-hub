"use client";

import { motion, type Variants } from "motion/react";

/**
 * Primitif entrance untuk seluruh aplikasi.
 *
 * Angka-angka di bawah adalah pemetaan satu-satu dari token di
 * `app/globals.css` (`--motion-base`, `--motion-stagger`, `--ease-out-expo`).
 * `motion` menerima detik dan array cubic-bezier, bukan string CSS, jadi
 * pemetaan itu harus terjadi di suatu tempat — tempatnya di sini, sekali.
 * Komponen lain memakai <Reveal>/<Stagger> dan tidak pernah menulis durasi
 * atau easing sendiri.
 *
 * Kebijakan prefers-reduced-motion tidak diurus di sini: <MotionConfig
 * reducedMotion="user"> di components/motion/motion-provider.tsx membuang
 * `y` (transform) dan menyisakan `opacity` secara otomatis.
 */
const DURATION_BASE = 0.26; // --motion-base: 260ms
const STAGGER = 0.04; // --motion-stagger: 40ms
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const; // --ease-out-expo

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: STAGGER },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT_EXPO },
  },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

/**
 * Item dalam stagger. Harus di-nest dalam Stagger (atau ancestor motion yang
 * menyediakan initial/animate) untuk beranimasi; tanpa induk, akan render tanpa animasi.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
