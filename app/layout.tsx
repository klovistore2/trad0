import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/i18n/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Trad0 · Live translation",
  description: "Speak naturally. The other person reads and hears you in their language, live.",
  applicationName: "Trad0",
  manifest: "/manifest.webmanifest",
  // Nothing is held back from crawlers or assistants: the public pages are meant to be read.
  robots: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  openGraph: { siteName: "Trad0", type: "website" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#f7f6f2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('a-deux-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();` }} />
    </head>
    <body>{children}</body>
  </html>;
}
