import type { NextConfig } from "next";
import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const version = packageJson.version;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  async redirects() {
    // Compatibilità con pagine memorizzate e vecchie installazioni PWA.
    return [
      ...["logo-circolo-chigi.webp", "logo-circolo-chigi-light.webp", "logo-circolo-chigi-mark.webp"]
        .map((name) => ({ source: `/${name}`, destination: `/brand/logos/${name}`, permanent: true })),
      ...["icon-192x192.png", "icon-512x512.png", "icon-maskable-512x512.png"]
        .map((name) => ({ source: `/${name}`, destination: `/brand/icons/${name}`, permanent: true })),
      { source: "/icon.png", destination: "/brand/icons/icon-512x512.png", permanent: true },
      { source: "/splash/:path*", destination: "/brand/splash/:path*", permanent: true },
      // La classifica vive nella tab del torneo.
      { source: "/classifica", destination: "/torneo", permanent: false },
    ];
  },
  images: {
    // Next 16 blocca le query sulle immagini locali: il ?v= dei loghi è il cache-busting del brand.
    localPatterns: [
      { pathname: "/brand/**", search: "?v=2" },
      { pathname: "/**", search: "" },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.enjore.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
