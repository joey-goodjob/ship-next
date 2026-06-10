import type { MetadataRoute } from "next";
import { envConfigs } from "@/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: envConfigs.app_name,
    short_name: envConfigs.app_name,
    description: envConfigs.app_description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#eca307",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
