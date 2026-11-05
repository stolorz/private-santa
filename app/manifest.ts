import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Private Santa",
    short_name: "Private Santa",
    description:
      "Run a private Secret Santa with exclusions, wishlists, and a link for each guest.",
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
