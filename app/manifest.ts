import type { MetadataRoute } from "next";
import { translator } from "@/lib/i18n/strings";

export default function manifest(): MetadataRoute.Manifest {
  const t = translator("en");
  return {
    name: `Trad0 · ${t("homeEyebrow")}`,
    short_name: "Trad0",
    description: t("homeIntro"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f6f2",
    theme_color: "#f7f6f2",
    lang: "en",
    categories: ["travel", "productivity", "utilities"],
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
