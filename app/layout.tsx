import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCI Fuel Finder",
  description: "No-premium DCI fuel stations across Northern Ireland and the Republic of Ireland.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "DCI Fuel", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f8a5f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
