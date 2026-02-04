import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// 1. PWA 설정
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // swcMinify: true,
  disable: process.env.NODE_ENV === "development", // 개발 모드일 땐 PWA 끄기
  workboxOptions: {
    disableDevLogs: true,
  },
});

// 2. 기존 Next.js 설정
const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
};

// 3. 두 설정을 감싸서 내보내기
export default withPWA(nextConfig);
