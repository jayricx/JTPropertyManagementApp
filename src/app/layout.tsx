import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Renta-PH",
  description:
    "Register properties, track income, and manage maintenance for your rental portfolio.",
  applicationName: "Renta-PH",
  appleWebApp: {
    capable: true,
    title: "Renta-PH",
    // Edge-to-edge under the notch; the chrome pads itself with
    // env(safe-area-inset-*).
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Next emits the standard `mobile-web-app-capable`; iOS before 16.4 only
  // honours the Apple-prefixed name, so both are sent.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

/**
 * `viewportFit: "cover"` lets the layout run under the notch/home indicator;
 * the safe-area env() paddings keep the chrome tappable. theme-color follows
 * the OS color scheme, which is what browsers paint their own UI with.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#065f46" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1a16" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // next-themes writes the light/dark class onto <html> before React
      // hydrates, so the server-rendered className is expected to differ.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <InstallPrompt />
          <ServiceWorkerRegister />
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
