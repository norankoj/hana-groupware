"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useCurrentMenu } from "@/components/ClientLayout";

type Menu = {
  id: number;
  name: string;
  path: string;
  roles: string[];
  icon_key: string;
  is_admin_only: boolean;
};

const ALL_ROLES = [
  { key: "admin", label: "관리자" },
  { key: "pastor", label: "목사/사모" },
  { key: "director", label: "디렉터" },
  { key: "staff", label: "사역자" },
  { key: "campleader", label: "진장" },
  { key: "cellleader", label: "셀리더" },
  { key: "member", label: "일반" },
];

// ★ [추가] 입력 필드를 별도 컴포넌트로 분리 (렌더링 최적화 & DB 요청 최소화)
const MenuNameEditor = ({
  id,
  initialName,
  onSave,
}: {
  id: number;
  initialName: string;
  onSave: (id: number, newName: string) => void;
}) => {
  const [value, setValue] = useState(initialName);

  // 상위 데이터가 바뀌면 내부 값도 동기화
  useEffect(() => {
    setValue(initialName);
  }, [initialName]);

  return (
    <input
      type="text"
      className="w-full border-gray-300 rounded-md text-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-gray-700"
      value={value}
      onChange={(e) => setValue(e.target.value)} // 로컬 상태만 변경 (즉시 반응)
      onBlur={() => {
        // 포커스가 빠질 때만 저장 (변경사항이 있을 경우에만)
        if (value !== initialName) {
          onSave(id, value);
        }
      }}
    />
  );
};

export default function AdminMenusPage() {
  const supabase = createClient();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const menu = useCurrentMenu();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("menus")
      .select("*")
      .order("sort_order");
    if (data) setMenus(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ★ [수정] DB 업데이트 로직 (컴포넌트에서 onBlur 때 호출됨)
  const handleNameSave = async (id: number, newName: string) => {
    // 1. UI 먼저 반영 (낙관적 업데이트) - 사실상 컴포넌트 내부에서 이미 보여지지만 데이터 동기화를 위해
    setMenus((prev) =>
      prev.map((m) => (m.id === id ? { ...m, name: newName } : m)),
    );

    // 2. DB 업데이트
    await supabase.from("menus").update({ name: newName }).eq("id", id);
  };

  /** ↑↓ 버튼으로 순서 변경 */
  const moveMenu = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= menus.length) return;

    const updated = [...menus];
    [updated[index], updated[targetIndex]] = [
      updated[targetIndex],
      updated[index],
    ];

    // sort_order 재계산 (index 기반)
    const reordered = updated.map((m, i) => ({ ...m, sort_order: i + 1 }));
    setMenus(reordered);

    // DB 업데이트 (두 개만)
    await Promise.all([
      supabase
        .from("menus")
        .update({ sort_order: reordered[index].sort_order })
        .eq("id", reordered[index].id),
      supabase
        .from("menus")
        .update({ sort_order: reordered[targetIndex].sort_order })
        .eq("id", reordered[targetIndex].id),
    ]);
  };

  const toggleRole = async (
    menuId: number,
    roleKey: string,
    currentRoles: string[],
  ) => {
    let newRoles;
    if (currentRoles.includes(roleKey)) {
      newRoles = currentRoles.filter((r) => r !== roleKey);
    } else {
      newRoles = [...currentRoles, roleKey];
    }

    // UI 즉시 반영 (UX 향상) - DB 요청보다 먼저 실행
    setMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, roles: newRoles } : m)),
    );

    await supabase.from("menus").update({ roles: newRoles }).eq("id", menuId);
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {menu?.name || "메뉴 관리"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          사이트의 메뉴 이름과 접근 권한을 실시간으로 관리합니다.
        </p>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-base font-bold text-gray-800">전체 메뉴 목록</h2>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-blue-600 hover:underline"
          >
            변경사항 적용 (새로고침)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-20">
                  순서
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-56">
                  메뉴 이름
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  경로 (Path)
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  접근 권한 (체크하여 허용)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {menus.map((menu, index) => (
                <tr
                  key={menu.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* 순서 변경 버튼 */}
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveMenu(index, "up")}
                        disabled={index === 0}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-20 disabled:cursor-not-allowed"
                        title="위로"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveMenu(index, "down")}
                        disabled={index === menus.length - 1}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-20 disabled:cursor-not-allowed"
                        title="아래로"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  {/* 메뉴 이름 */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <MenuNameEditor
                      id={menu.id}
                      initialName={menu.name}
                      onSave={handleNameSave}
                    />
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                      {menu.path}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-4 flex-wrap">
                      {ALL_ROLES.map((role) => (
                        <label
                          key={role.key}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                            checked={menu.roles.includes(role.key)}
                            onChange={() =>
                              toggleRole(menu.id, role.key, menu.roles)
                            }
                            disabled={
                              menu.is_admin_only && !["admin", "director"].includes(role.key)
                            }
                          />
                          <span
                            className={`text-sm ${
                              menu.roles.includes(role.key)
                                ? "text-gray-900 font-medium"
                                : "text-gray-400"
                            }`}
                          >
                            {role.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
