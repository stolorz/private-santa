import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  // Opening http://127.0.0.1:3000 while the server advertises localhost
  // otherwise blocks /_next (including the login page's JS), so the form
  // never POSTs and the browser just reloads /login?.
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/admin", destination: "/events", permanent: false },
      { source: "/dashboard", destination: "/events", permanent: false },
      { source: "/groups", destination: "/events", permanent: false },
      { source: "/g/:slug/:path*", destination: "/events", permanent: false },
      {
        source: "/e/:code/dashboard",
        destination: "/e/:code/admin",
        permanent: false,
      },
    ];
  },
  // Keep native / Node-only packages out of the webpack bundle. Notably
  // better-auth statically pulls in @better-auth/kysely-adapter which
  // breaks when webpack tries to resolve kysely's internal exports.
  serverExternalPackages: [
    "better-auth",
    "@better-auth/kysely-adapter",
    "kysely",
    "better-sqlite3",
    "web-push",
    "qrcode",
    "nodemailer",
    "imapflow",
    "sharp",
    "heic-convert",
    "exifr",
  ],
};

export default nextConfig;
