import type { MetadataRoute } from "next";

/**
 * Web App Manifest untuk PWA.
 *
 * `start_url: "/"` BUKAN `/dashboard` atau `/portal` karena `app/page.tsx`
 * sudah melempar user login ke areanya sendiri lewat `homeForRole()`. Saat
 * ikon launcher diketuk, kita ingin perilaku yang sama dengan mengetik URL
 * root di address bar — konsisten.
 *
 * `scope: "/"` artinya seluruh app ter-install sebagai satu aplikasi; tidak
 * ada halaman di luar scope yang seharusnya dianggap bagian dari app ini.
 *
 * Ikon `maskable` PENTING ada terpisah dari ikon biasa: Android adaptive
 * launcher akan crop ikon reguler jadi bulat/squircle dan konten vital
 * (logo) bisa ke pinggir. Varian maskable di-pad 10% di tiap sisi sehingga
 * meski di-crop agresif, logo tetap utuh.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PKP Hub",
    short_name: "PKP Hub",
    description: "Dashboard manajemen survey & pengukuran — Presisi Konsulindo Prima",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#ffffff",
    theme_color: "#1b6fd8",
    lang: "id",
    dir: "ltr",
    orientation: "any",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // 640x640 dengan padding 10% tiap sisi; aman dari mask bulat
        // dan squircle Android launcher.
        src: "/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
