// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import ChannelTalk from "@/components/ChannelTalk";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "수원하나교회 그룹웨어",
  description: "수원하나교회 사역자를 위한 통합 관리 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: "/images/icon-192x192.png",
    apple: "/images/icon-192x192.png", // 아이폰 전용
  },

  appleWebApp: {
    capable: true, // 홈 화면 추가 시 앱처럼 보이기 (주소창 숨김)
    title: "그룹웨어", // 홈 화면 아이콘 이름
    statusBarStyle: "default", // 상단 상태바 색상 (default / black / black-translucent)
  },
};

//뷰포트 설정 추가 (모바일에서 확대/축소 막고 앱처럼 보이게)
export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // 확대 금지 (앱 느낌)
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
          {children}
          <ChannelTalk />
        </ClientLayout>
      </body>
    </html>
  );
}
