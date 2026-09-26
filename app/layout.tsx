import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Root metadata.
 *
 * `metadataBase` is what lets every relative URL elsewhere resolve to an
 * absolute one, which is what Open Graph and the sitemap need. Without it they
 * emit bare paths and share cards render with no image.
 *
 * `title.template` means a page only has to supply its own short title and gets
 * the site name appended, rather than every page repeating it by hand and
 * drifting.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — AI chat with streaming, images, files and browser-based tools`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  // Nothing here is a secret, and the pages are genuinely useful to index.
  // The API routes are disallowed in robots.ts rather than here.
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — AI chat with streaming, images, files and browser-based tools`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-sidebar="open">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
