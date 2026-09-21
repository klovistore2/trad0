import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trad0 · Live translation",
  description: "Speak naturally. The other person reads and hears you in their language, live.",
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
