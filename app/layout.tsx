import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "À deux · Traduction en direct",
  description: "Parlez naturellement. Vos mots se traduisent en anglais, en direct.",
};
export const viewport: Viewport = { themeColor: "#f7f6f2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('a-deux-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();` }} />
    </head>
    <body>{children}</body>
  </html>;
}
