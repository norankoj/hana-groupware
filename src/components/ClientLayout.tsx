"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast, { Toaster } from "react-hot-toast";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import HeaderWeatherBadge from "@/components/dashboard/HeaderWeatherBadge";
import Image from "next/image";

// --- [1] Context 생성 (데이터 공유용) ---
type Menu = {
  id: number;
  name: string;
  path: string;
  icon_key: string;
  roles: string[];
  sort_order: number;
  is_active: boolean;
  is_admin_only: boolean;
};
const MenuContext = createContext<Menu | null>(null);

export const useCurrentMenu = () => useContext(MenuContext);

// --- [2] 아이콘 매핑 ---
const ICON_MAP: Record<string, any> = {
  home: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  ),
  calendar: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  ),
  notice: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
    />
  ),
  users: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  ),
  settings: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
  ),
  menu: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 12h16M4 18h16"
    />
  ),
  "currency-dollar": (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  reservation: (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
  expense: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
    />
  ),
  truck: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10l2-3h10l2 3h4v6h-2v-1a2 2 0 1 0-4 0v1H9v-1a2 2 0 1 0-4 0v1H3v-6zm4 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm10 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
    />
  ),
};

type Profile = {
  id: string;
  full_name: string;
  position: string;
  team_id: number;
  role: string;
  status: string;
  teams?: { name: string } | { name: string }[] | null;
};

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [isCollapsed, setIsCollapsed] = useState(false); // 데스크탑용 축소 상태
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // 모바일용 메뉴 열림 상태

  const [profile, setProfile] = useState<Profile | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 페이지 이동 시 모바일 메뉴 자동 닫기
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const fetchData = async (userId: string) => {
      const [{ data: profileData }, { data: menuData }] = await Promise.all([
        supabase
          .from("profiles")
          .select(`*, teams!profiles_team_id_fkey(name)`)
          .eq("id", userId)
          .single(),
        supabase
          .from("menus")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      if (profileData) setProfile(profileData as any);
      if (menuData) setMenus(menuData);
    };

    // onAuthStateChange로 모든 세션 상태 관리
    // - INITIAL_SESSION: 앱 최초 로드 시 기존 세션 복원
    // - SIGNED_IN: 실제 로그인 액션
    // 두 이벤트 모두 session이 있으면 fetchData 호출 → 중복 없이 정확하게 처리
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
          session?.user
        ) {
          fetchData(session.user.id);
        }
        if (event === "SIGNED_OUT") {
          setProfile(null);
          setMenus([]);
          router.replace("/login");
        }
        // 세션 만료 (토큰 갱신 실패)
        if (event === "TOKEN_REFRESHED" && !session) {
          toast.error("세션이 만료되었습니다. 다시 로그인해 주세요.", {
            duration: 4000,
          });
          setProfile(null);
          setMenus([]);
          router.replace("/login");
        }
      },
    );

    // 모바일 PWA: 앱이 백그라운드 → 포그라운드로 돌아올 때 세션 갱신
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          router.replace("/login");
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const activeMenu =
    menus.find(
      (m) =>
        pathname === m.path || (m.path !== "/" && pathname.startsWith(m.path)),
    ) || null;

  useEffect(() => {
    const pageTitle = activeMenu ? activeMenu.name : "수원하나교회 그룹웨어";
    document.title = `${pageTitle} - 수원하나교회`;
  }, [pathname, activeMenu]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (pathname === "/login")
    return (
      <>
        {children}
        <Toaster />
      </>
    );

  // 가입 승인 대기 중인 사용자 전용 화면
  if (profile && profile.role === "pending") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <Toaster />
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-10 text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            승인 대기 중입니다
          </h2>
          <p className="text-gray-500 text-sm mb-1">
            <span className="font-bold text-gray-700">{profile.full_name}</span>
            님, 가입을 환영합니다!
          </p>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            관리자가 계정을 승인하면 서비스를 이용하실 수 있습니다.
            <br />
            승인 완료 후 다시 로그인해 주세요.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  const teamName = profile?.teams
    ? Array.isArray(profile.teams)
      ? profile.teams[0]?.name
      : profile.teams.name
    : "소속없음";

  const visibleMenus = menus.filter((menu) => {
    if (!profile) return false;
    if (menu.is_admin_only && profile.role !== "admin") return false;
    return menu.roles.includes(profile.role);
  });

  return (
    <MenuContext.Provider value={activeMenu}>
      <div className="flex h-screen bg-[#F5F7FA]">
        {/* ★ [모바일용] 오버레이 (사이드바 열렸을 때 뒷배경 어둡게) */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* ★ 사이드바 (모바일 & PC 통합) */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 bg-white border-r border-gray-200 flex flex-col duration-300 ease-in-out
            md:translate-x-0 md:static md:inset-auto md:flex
            transition-all z-[100]
            ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            w-64 ${isCollapsed ? "md:w-20" : "md:w-64"}
          `}
        >
          <div className="h-16 relative flex items-center justify-end px-4 border-b border-gray-100 flex-shrink-0 overflow-hidden">
            {/* 로고 */}
            {(!isCollapsed || isMobileMenuOpen) && (
              <Link
                href="/"
                className="flex items-center text-xl font-bold text-gray-800 tracking-tight mr-2"
              >
                <Image
                  src="/logo.png"
                  alt="수원하나교회"
                  width={180}
                  height={50}
                  className="object-contain"
                />
              </Link>
            )}

            {/* PC용 접기 버튼 (모바일에서는 닫기 버튼으로 활용) */}
            <button
              onClick={() => {
                // 모바일에서는 아예 닫기, PC에서는 접기 토글
                if (window.innerWidth < 768) {
                  setIsMobileMenuOpen(false);
                } else {
                  setIsCollapsed(!isCollapsed);
                }
              }}
              className={`p-1 rounded hover:bg-gray-100 text-gray-400 ${isCollapsed && !isMobileMenuOpen ? "mx-auto" : ""}`}
            >
              {/* 모바일일 땐 X 아이콘, PC일 땐 햄버거 아이콘 */}
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto font-medium">
            {visibleMenus
              .filter((m) => !m.is_admin_only)
              .map((menu) => (
                <MenuItem
                  key={menu.id}
                  href={menu.path}
                  active={pathname === menu.path}
                  isCollapsed={isCollapsed && !isMobileMenuOpen} // 모바일 열렸을 땐 항상 펼침 상태로
                  label={menu.name}
                  icon={ICON_MAP[menu.icon_key] || ICON_MAP["home"]}
                />
              ))}
            {visibleMenus.some((m) => m.is_admin_only) && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {visibleMenus
                  .filter((m) => m.is_admin_only)
                  .map((menu) => (
                    <MenuItem
                      key={menu.id}
                      href={menu.path}
                      active={pathname.startsWith(menu.path)}
                      isCollapsed={isCollapsed && !isMobileMenuOpen}
                      label={menu.name}
                      icon={ICON_MAP[menu.icon_key] || ICON_MAP["settings"]}
                      extraIcon={
                        menu.icon_key === "settings" ? (
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        ) : null
                      }
                    />
                  ))}
              </div>
            )}
          </nav>
        </aside>

        {/* 메인 컨텐츠 영역 */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              {/* ★ [모바일용] 햄버거 버튼 (md:hidden) */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 -ml-2 rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>

            {/* 우측 프로필 영역 */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-4 focus:outline-none group"
              >
                <div className="text-right hidden sm:flex flex-col items-end justify-center">
                  <span className="text-base font-bold text-gray-900 leading-none mb-1">
                    {profile?.full_name || "로딩중..."} 님
                  </span>
                  <span className="text-sm text-gray-500 font-normal leading-none">
                    {teamName} · {profile?.position || "직분미정"}
                  </span>
                </div>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center text-white text-lg font-medium shadow-sm transition-transform group-hover:scale-105">
                  {profile?.full_name ? profile.full_name.slice(0, 1) : "?"}
                </div>
              </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-3 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-fadeIn z-50">
                  <div className="px-4 py-3 border-b border-gray-100 sm:hidden">
                    <p className="text-sm font-bold text-gray-900">
                      {profile?.full_name}
                    </p>
                    <p className="text-xs text-gray-500">{teamName}</p>
                  </div>

                  <button
                    onClick={() => router.push("/mypage")}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    내 정보
                  </button>
                  <button
                    onClick={() => {
                      setIsPasswordModalOpen(true);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    비밀번호 변경
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* 컨텐츠 (패딩 조절: 모바일 p-4, PC p-8) */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-8">{children}</main>

          <Toaster
            position="top-center"
            containerStyle={{ zIndex: 99999 }}
            toastOptions={{
              style: {
                background: "#333",
                color: "#fff",
                fontSize: "14px",
                borderRadius: "8px",
              },
              success: { style: { background: "#10B981" } },
              error: { style: { background: "#EF4444" } },
            }}
          />
        </div>
        {/* 오늘 뭐먹지 플로팅 버튼 — 대시보드 바로가기로 이동 */}
        {/* <Link
          href="/lunch"
          className="fixed bottom-6 left-6 z-50 group md:bottom-8 md:left-8 transition-transform hover:scale-110"
        >
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap shadow-xl pointer-events-none">
            오늘 점심 뭐 먹지?🤔
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
          </div>
          <div className="w-14 h-14 bg-gradient-to-tr from-orange-400 to-pink-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce-slow hover:animate-none hover:rotate-12 transition-all cursor-pointer">
            <span className="text-2xl filter drop-shadow-md">🍔</span>
          </div>
        </Link> */}
        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
        />
      </div>
    </MenuContext.Provider>
  );
}

function MenuItem({
  href,
  icon,
  extraIcon,
  label,
  isCollapsed,
  active,
  disabled,
}: any) {
  return (
    <Link
      href={href}
      className={`flex items-center px-4 py-3 rounded-lg transition-colors mb-1 ${active ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <svg
        className={`w-5 h-5 flex-shrink-0 ${active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {icon}
        {extraIcon}
      </svg>
      {/* collapsed 상태여도 모바일 메뉴가 열려있으면 글씨가 보여야 함 */}
      {!isCollapsed && (
        <span
          className={`ml-3 text-[15px] whitespace-nowrap overflow-hidden ${active ? "font-bold" : "font-medium"}`}
        >
          {label}
        </span>
      )}
    </Link>
  );
}
