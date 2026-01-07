import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/lib/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

// METADATA PWA UFFICIALI NEXT.JS
export const metadata: Metadata = {
  title: "Gestionale Squadra",
  description: "App gestione squadra di calcio",
  manifest: "/manifest.json", // Link al manifest standard
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png", // Icona per iOS
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Real Chigi",
  },
};

// CONFIGURAZIONE VIEWPORT (Separata in Next 14+)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        
        {/* Registrazione SW */}
        <ServiceWorkerRegister />

        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SiteHeader />
            <main className="pt-16 pb-safe min-h-screen"> 
              {children}
            </main>
            <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}