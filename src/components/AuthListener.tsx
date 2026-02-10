// src/components/AuthListener.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import toast from "react-hot-toast";

function AuthListenerContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // URL에 ?error=unauthorized 가 있는지 확인
    if (searchParams.get("error") === "unauthorized") {
      toast.error("접근 권한이 없습니다."); // 원하는 메시지로 수정 가능

      // URL에서 지저분한 에러 파라미터 제거 (페이지 새로고침 없이 URL만 변경)
      const newUrl = window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [searchParams]);

  return null; // 화면에 아무것도 그리지 않음 (기능만 수행)
}

export default function AuthListener() {
  // useSearchParams를 쓰려면 Suspense로 감싸야 빌드 에러가 안 납니다.
  return (
    <Suspense fallback={null}>
      <AuthListenerContent />
    </Suspense>
  );
}
