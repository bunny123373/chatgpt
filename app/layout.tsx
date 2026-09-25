import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatGPT 2.0",
  description: "An AI chat app with streaming, Markdown, and local chat history. Built with Next.js.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-sidebar="open">
      <body>{children}</body>
    </html>
  );
}
