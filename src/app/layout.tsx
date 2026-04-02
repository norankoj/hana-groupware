// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
// Inter 폰트 제거 — Pretendard는 globals.css에서 CDN으로 로드
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import ChannelTalk from "@/components/ChannelTalk";
import AuthListener from "@/components/AuthListener";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";

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
    title: "수원하나교회 그룹웨어",
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
      <body>
        <ErrorBoundary>
          <ClientLayout>
            <AuthListener />
            {children}
            {/* <ChannelTalk /> */}
            <PwaInstallPrompt />
          </ClientLayout>
        </ErrorBoundary>
      </body>
    </html>
  );
}
