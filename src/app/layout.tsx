// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import ChannelTalk from "@/components/ChannelTalk";
import AuthListener from "@/components/AuthListener";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "수원하나교회 그룹웨어",
  description: "수원하나교회 사역자를 위한 통합 관리 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: "/images/icon-192x192.png",
    apple: "/images/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    title: "그룹웨어",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <ClientLayout>
          <AuthListener />
          {children}
          <ChannelTalk />
        </ClientLayout>
      </body>
    </html>
  );
}
