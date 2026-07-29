import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/motion/motion-provider";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { RegisterSW } from "@/components/pwa/register-sw";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * `themeColor` dipisah ke `viewport` (bukan `metadata.themeColor` yang
 * deprecated di Next 15+). Dipakai Chrome Android untuk mewarnai address
 * bar; Safari iOS pakai `appleWebApp.statusBarStyle` sebagai gantinya.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1b6fd8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: { template: "%s · PKP Hub", default: "PKP Hub" },
  description: "Dashboard manajemen survey & pengukuran — Presisi Konsulindo Prima",
  // Internal tool only — never index in search engines.
  robots: { index: false, follow: false },
  applicationName: "PKP Hub",
  // Disetel eksplisit walau Next otomatis membuat link ini dari
  // `app/manifest.ts` — kalau file itu hilang, manifest link tetap ada
  // dan user cuma kehilangan data install saja, bukan link sama sekali.
  manifest: "/manifest.webmanifest",
  // Web app capable: iOS Safari mengangkat full-screen mode + hide
  // address bar saat user memilih "Add to Home Screen" dari Share menu.
  appleWebApp: {
    capable: true,
    title: "PKP Hub",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon.webp", type: "image/webp" }],
    // apple-touch-icon 180x180 khusus iOS — di-render dari script
    // `pnpm tsx scripts/generate-pwa-icons.ts`. iOS 16.4+ sebenarnya
    // sudah baca dari manifest, tapi link tag tetap dihormati untuk
    // fallback.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` diperlukan karena next-themes menulis class
    // tema ke <html> lewat script pre-paint, sebelum React menghidrasi.
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <MotionProvider>
              {children}
              {/* PWA bootstrap. RegisterSW efeknya nol render; InstallPrompt
                  me-mount tombol mengambang + modal secara lazy di client. */}
              <RegisterSW />
              <InstallPrompt />
            </MotionProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
