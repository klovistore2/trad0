import type { MetadataRoute } from "next";
import { absolute } from "@/lib/i18n/site-url";

// Every crawler and every AI agent is welcome on the public pages; nothing is blocked by user agent.
// Conversations and the API are left out because they are private addresses, not because of who asks.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/session/", "/join/"] }],
    sitemap: absolute("/sitemap.xml"),
  };
}
