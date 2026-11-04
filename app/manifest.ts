import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhatsApp Secret Santa",
    short_name: "Secret Santa",
    description:
      "Run a secret santa with exclusions, wishlists and WhatsApp delivery.",
    start_url: "/events",
    display: "standalone",
    background_color: "#eef3f8",
    theme_color: "#d6e4f1",
    icons: [
      {
        src: "/android.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/ios.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/ios.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
