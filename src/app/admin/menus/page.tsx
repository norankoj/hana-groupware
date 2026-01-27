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
  { key: "director", label: "디렉터" },
  { key: "staff", label: "사역자" },
  { key: "campleader", label: "진장" },
  { key: "cellleader", label: "셀리더" },
  { key: "member", label: "일반" },
];

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

  // 메뉴 이름 변경
  const updateName = async (id: number, newName: string) => {
    await supabase.from("menus").update({ name: newName }).eq("id", id);
    // UI 즉시 반영 (UX 향상)
    setMenus((prev) =>
      prev.map((m) => (m.id === id ? { ...m, name: newName } : m)),
    );
  };

  // 권한(Role) 토글 함수
  const toggleRole = async (
    menuId: number,
    roleKey: string,
    currentRoles: string[],
  ) => {
    let newRoles;
    if (currentRoles.includes(roleKey)) {
      // 이미 있으면 제거
      newRoles = currentRoles.filter((r) => r !== roleKey);
    } else {
      // 없으면 추가
      newRoles = [...currentRoles, roleKey];
    }

    await supabase.from("menus").update({ roles: newRoles }).eq("id", menuId);

    // UI 즉시 반영
    setMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, roles: newRoles } : m)),
    );

    // ★ 중요: 사이드바가 변경사항을 알 수 있게 새로고침 유도 (또는 리얼타임 적용 가능)
    // 여기서는 간단하게 DB 업데이트만 하고, 사용자가 F5 누르면 반영됩니다.
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
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-64">
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
              {menus.map((menu) => (
                <tr
                  key={menu.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* 메뉴 이름 수정 */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="text"
                      className="w-full border-gray-300 rounded-md text-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-gray-700"
                      value={menu.name}
                      onChange={(e) => updateName(menu.id, e.target.value)}
                    />
                  </td>

                  {/* 경로 (읽기 전용) */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                      {menu.path}
                    </span>
                  </td>

                  {/* 권한 체크박스 그룹 */}
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
                              menu.is_admin_only && role.key !== "admin"
                            } // 관리자 전용 메뉴 보호
                          />
                          <span
                            className={`text-sm ${menu.roles.includes(role.key) ? "text-gray-900 font-medium" : "text-gray-400"}`}
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
