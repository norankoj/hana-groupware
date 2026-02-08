export default function Loading() {
  return (
    // 전체 화면을 흰색으로 덮고 중앙에 로고 배치
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center animate-pulse">
        {/* 로고 이미지 (public/images/icon-192x192.png 경로가 맞는지 확인하세요) */}
        <img
          src="/images/icon-192x192.png"
          alt="로고"
          className="w-24 h-24 mb-4 object-contain"
        />
        <p className="text-gray-500 font-bold text-lg">수원하나교회 그룹웨어</p>
        <p className="text-gray-400 text-xs mt-1">로딩 중...</p>
      </div>
    </div>
  );
}
