// src/utils/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        // 쿠키 유지 시간을 1년으로 설정
        maxAge: 60 * 60 * 24 * 365,
        domain: "",
        path: "/",
        sameSite: "lax",
        secure: true,
      },
    },
  );
}
