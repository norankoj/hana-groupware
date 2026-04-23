import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// 1. PWA 설정
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  // swcMinify: true,
  disable: process.env.NODE_ENV === "development", // 개발 모드일 땐 PWA 끄기
  workboxOptions: {
    disableDevLogs: true,
  },
});

// 2. 기존 Next.js 설정
const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    localPatterns: [
      { pathname: "/**" },
      { pathname: "/api/proxy-image", search: "**" },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // MinIO (NAS) — 로컬 및 외부 접근
      {
        protocol: "http",
        hostname: "**",
        port: "9000",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
        port: "9000",
        pathname: "/**",
      },
    ],
  },
};

// 3. 두 설정을 감싸서 내보내기
export default withPWA(nextConfig);
