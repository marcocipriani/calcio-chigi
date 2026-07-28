import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/lib/ServiceWorkerRegister";
import { Toaster } from "@/components/ui/toaster";
import { AppSessionProvider } from "@/components/auth/AppSessionProvider";
import { AppGates } from "@/components/auth/AppGates";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Calcio Chigi",
  description: "Gestione della squadra di calcio del Circolo Chigi",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Real Chigi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground antialiased overscroll-none`}>
        <a
          className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
          href="#main-content"
        >
          Vai al contenuto
        </a>
        <ServiceWorkerRegister />

        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AppSessionProvider>
              <AppGates />
              <SiteHeader />
              <div className="min-h-screen pt-16 pb-bottom-nav" id="main-content">
                {children}
              </div>
              <Toaster />
              <BottomNav />
            </AppSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
