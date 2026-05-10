import type { Metadata } from "next";
import "./globals.css";
import CsrfBootstrap from "./csrf-bootstrap";
import { UIProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "専門学校 入学出願システム",
  description: "専門学校への入学願書をオンラインで提出できるシステムです。",
  keywords: "専門学校, 入学, 出願, 願書",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">
        <CsrfBootstrap />
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  );
}
