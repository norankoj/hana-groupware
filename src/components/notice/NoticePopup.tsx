"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type NoticeAttachment = { name: string; url: string; type: "image" | "file" };
type PopupNotice = {
  id: number;
  title: string;
  content: string;
  category: string;
  popup_until: string | null;
  attachments: NoticeAttachment[];
};

const CATEGORY_STYLE: Record<string, string> = {
  공지: "bg-blue-50 text-blue-700 border-blue-200",
  중요: "bg-red-50 text-red-700 border-red-200",
  일반: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function NoticePopup() {
  const supabase = createClient();
  const router = useRouter();
  const [popupNotices, setPopupNotices] = useState<PopupNotice[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const fetchPopup = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("notices")
        .select("id, title, content, category, popup_until, attachments")
        .eq("popup_enabled", true)
        .gte("popup_until", now)
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) return;

      const today = new Date().toISOString().slice(0, 10);
      const hiddenRaw = localStorage.getItem("notice_popup_today") || "{}";
      const hidden: Record<string, string> = JSON.parse(hiddenRaw);
      const filtered = (data as PopupNotice[]).filter(
        (n) => hidden[String(n.id)] !== today,
      );
      if (filtered.length > 0) setPopupNotices(filtered);
    };
    fetchPopup();
  }, []);

  const hideToday = (id: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const hiddenRaw = localStorage.getItem("notice_popup_today") || "{}";
    const hidden = JSON.parse(hiddenRaw);
    hidden[String(id)] = today;
    localStorage.setItem("notice_popup_today", JSON.stringify(hidden));
    const next = popupNotices.filter((n) => n.id !== id);
    setPopupNotices(next);
    if (currentIdx >= next.length) setCurrentIdx(Math.max(0, next.length - 1));
  };

  const close = () => {
    const next = popupNotices.filter((_, i) => i !== currentIdx);
    setPopupNotices(next);
    setCurrentIdx(Math.min(currentIdx, next.length - 1));
  };

  if (popupNotices.length === 0) return null;
  const notice = popupNotices[currentIdx];
  const img = (notice.attachments || []).find((a) => a.type === "image");
  const total = popupNotices.length;

  return (
    <div className="fixed top-2 left-2 z-[99999]">
      <div className="bg-white border border-gray-200 shadow-2xl overflow-hidden w-96">

        {/* 클릭 시 공지 상세로 이동 */}
        <div
          className="cursor-pointer"
          onClick={() => router.push(`/notice/${notice.id}`)}
        >
          {img ? (
            <div className="relative">
              <img src={img.url} alt={img.name} className="w-full object-cover max-h-72" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-4">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[notice.category] || CATEGORY_STYLE["일반"]}`}>
                  {notice.category}
                </span>
                <p className="text-base font-bold text-white mt-1.5 leading-snug drop-shadow">{notice.title}</p>
              </div>
            </div>
          ) : (
            <div className="px-5 pt-5 pb-3 hover:bg-gray-50 transition-colors">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[notice.category] || CATEGORY_STYLE["일반"]}`}>
                {notice.category}
              </span>
              <p className="text-base font-bold text-gray-900 mt-2 leading-snug">{notice.title}</p>
              {notice.content?.trim() && (
                <p className="text-sm text-gray-500 leading-relaxed line-clamp-5 mt-2"
                   dangerouslySetInnerHTML={{ __html: notice.content }} />
              )}
            </div>
          )}
        </div>

        {/* 하단 바 */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-900 gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => hideToday(notice.id)}
              className="text-xs text-gray-400 hover:text-white transition whitespace-nowrap"
            >
              오늘은 그만보기
            </button>
            {total > 1 && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => setCurrentIdx((i) => (i - 1 + total) % total)}
                  className="text-gray-400 hover:text-white transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-[10px] text-gray-500">{currentIdx + 1}/{total}</span>
                <button
                  onClick={() => setCurrentIdx((i) => (i + 1) % total)}
                  className="text-gray-400 hover:text-white transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={close}
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-white transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
