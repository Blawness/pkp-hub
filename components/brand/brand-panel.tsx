"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { Reveal, Stagger } from "@/components/motion/reveal";

const LAYANAN = ["Survey topografi", "Pengukuran lahan", "Pemetaan digital"];

/** Simpangan maksimum grid saat parallax, dalam px. */
const PARALLAX_RANGE = 6;

/**
 * Panel brand — satu-satunya definisi di aplikasi, dipakai bersama oleh `/`
 * dan `/login`. Membungkusnya dengan <ViewTransition name="brand-panel"> di
 * kedua halaman itulah yang membuat panel ini BERTAHAN saat navigasi antara
 * keduanya, alih-alih hilang lalu muncul lagi.
 *
 * Parallax hanya berjalan untuk pointer mouse (`event.pointerType`), jadi
 * perangkat sentuh tidak pernah menjalankannya. Saat pengguna meminta
 * reduced-motion, <MotionConfig reducedMotion="user"> membuang transform-nya,
 * sehingga grid diam meski nilai motion tetap berubah.
 */
export function BrandPanel() {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  // Spring meredam gerakan supaya grid tidak "menempel" kaku di kursor.
  const springX = useSpring(pointerX, { stiffness: 120, damping: 20, mass: 0.4 });
  const springY = useSpring(pointerY, { stiffness: 120, damping: 20, mass: 0.4 });

  // -0.5..0.5 (posisi relatif kursor) -> -6..6 px
  const gridX = useTransform(springX, [-0.5, 0.5], [-PARALLAX_RANGE, PARALLAX_RANGE]);
  const gridY = useTransform(springY, [-0.5, 0.5], [-PARALLAX_RANGE, PARALLAX_RANGE]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function handlePointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex flex-col justify-between overflow-hidden bg-brand-base px-8 py-10 text-white lg:px-12 lg:py-14"
    >
      {/* Tekstur grid. CSS murni — tidak ada aset gambar. Digeser oleh parallax. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-8"
        style={{
          x: gridX,
          y: gridY,
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Cahaya aksen di sudut, biar grid-nya tidak terbaca rata seperti kertas milimeter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--brand-accent)" }}
      />

      <Stagger className="relative">
        <Reveal>
          <p className="font-heading text-xl font-semibold tracking-tight">PKP Hub</p>
          <p className="mt-1 text-sm text-white/60">Presisi Konsulindo Prima</p>
        </Reveal>
      </Stagger>

      <Stagger className="relative mt-10 lg:mt-0">
        <Reveal>
          <p className="font-heading text-2xl leading-snug font-medium text-balance lg:text-3xl">
            Presisi dalam setiap ukuran.
          </p>
        </Reveal>
        <ul className="mt-6 space-y-2.5">
          {LAYANAN.map((item) => (
            <Reveal key={item}>
              <li className="flex items-center gap-2.5 text-sm text-white/70">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-accent" />
                {item}
              </li>
            </Reveal>
          ))}
        </ul>
      </Stagger>

      {/*
        Footer juga dibungkus <Stagger>, bukan <Reveal> telanjang: <Reveal>
        hanya mendeklarasikan variants, dan variants baru dijalankan bila ada
        induk yang memicunya (`initial`/`animate` ada di <Stagger>). <Reveal>
        yang berdiri sendiri tidak akan pernah beranimasi.
      */}
      <Stagger className="relative mt-10 lg:mt-0">
        <Reveal>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Presisi Konsulindo Prima
          </p>
        </Reveal>
      </Stagger>
    </div>
  );
}
