// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import ChannelTalk from "@/components/ChannelTalk";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "수원하나교회 그룹웨어",
  description: "수원하나교회 사역자를 위한 통합 관리 시스템",
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
