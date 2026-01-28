"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useCurrentMenu } from "@/components/ClientLayout";
import toast from "react-hot-toast"; // 알림을 위해 추가 (선택사항)

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  position: string;
  team_id: number | null;
  role: string;
  is_approver: boolean;
  total_leave_days: number;
  used_leave_days: number;
};

type Team = {
  id: number;
  name: string;
};

const ROLE_TO_POSITION: Record<string, string> = {
  admin: "관리자",
  director: "디렉터",
  staff: "전도사",
  campleader: "진장",
  cellleader: "셀리더",
  member: "성도",
};

export default function AdminTeamsPage() {
  const supabase = createClient();
  const menu = useCurrentMenu();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: usersData } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    const { data: teamsData } = await supabase
      .from("teams")
      .select("*")
      .order("id");
    if (usersData) setProfiles(usersData as any);
    if (teamsData) setTeams(teamsData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ★ [1] 시스템 전체 새로고침 (헤더/메뉴 반영용)
  const handleSystemReload = () => {
    if (
      confirm(
        "페이지를 새로고침 하시겠습니까?\n변경사항이 메뉴와 헤더에 즉시 반영됩니다.",
      )
    ) {
      window.location.reload();
    }
  };

  // 정보 업데이트 함수들
  const updateMemberTeam = async (userId: string, teamId: string) => {
    const value = teamId === "none" ? null : parseInt(teamId);
    await supabase.from("profiles").update({ team_id: value }).eq("id", userId);
    // UI 업데이트 (fetchData 없이 즉시 반영)
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, team_id: value } : p)),
    );
    toast.success("팀이 변경되었습니다.");
  };

  const updateMemberRole = async (userId: string, newRole: string) => {
    const newPosition = ROLE_TO_POSITION[newRole] || "성도";
    await supabase
      .from("profiles")
      .update({ role: newRole, position: newPosition })
      .eq("id", userId);

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === userId ? { ...p, role: newRole, position: newPosition } : p,
      ),
    );
    toast.success("권한이 변경되었습니다.");
  };

  const toggleApprover = async (userId: string, currentValue: boolean) => {
    await supabase
      .from("profiles")
      .update({ is_approver: !currentValue })
      .eq("id", userId);

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === userId ? { ...p, is_approver: !currentValue } : p,
      ),
    );
    toast.success("결재 권한이 변경되었습니다.");
  };

  // ★ [2] 연차 관리: 입력 중에는 화면만 갱신 (서버 통신 X)
  const handleLeaveChange = (
    userId: string,
    field: "total_leave_days" | "used_leave_days",
    value: string,
  ) => {
    // 숫자가 아니면 무시하지만, 빈 값은 허용(지울 때 대비)
    const numValue = value === "" ? 0 : parseFloat(value);

    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, [field]: numValue } : p)),
    );
  };

  // ★ [3] 연차 관리: 포커스가 빠졌을 때(onBlur) 서버 저장
  const saveLeaveData = async (
    userId: string,
    field: "total_leave_days" | "used_leave_days",
    value: number,
  ) => {
    await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("id", userId);
    toast.success("연차 정보가 저장되었습니다.");
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600"></div>
      </div>
    );

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {menu?.name || "사용자 관리"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            교회 구성원의 소속, 권한, 그리고 연차 일수를 관리합니다.
          </p>
        </div>

        {/* ★ 전체 새로고침 버튼 추가 */}
        <button
          onClick={handleSystemReload}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-md hover:bg-gray-700 transition flex items-center gap-2 shadow-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          시스템 반영 (전체 새로고침)
        </button>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-base font-bold text-gray-800">
            전체 구성원 명단 ({profiles.length}명)
          </h2>
          <button
            onClick={fetchData}
            className="text-xs text-blue-600 hover:underline"
          >
            목록 새로고침
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  이름 / 직분
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  소속 팀
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  시스템 권한
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                  결재 권한
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                  연차 관리 (총/사용)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {profiles.map((person) => (
                <tr
                  key={person.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-9 w-9 rounded bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm border border-gray-200">
                        {person.full_name.slice(0, 1)}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-bold text-gray-900">
                          {person.full_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {person.position}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      className="block w-full py-1.5 pl-2 pr-8 text-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md bg-white cursor-pointer"
                      value={person.team_id || "none"}
                      onChange={(e) =>
                        updateMemberTeam(person.id, e.target.value)
                      }
                    >
                      <option value="none" className="text-gray-400">
                        소속 없음
                      </option>
                      {teams.map((team) => (
                        <option
                          key={team.id}
                          value={team.id}
                          className="text-gray-900"
                        >
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      className={`block w-full py-1.5 pl-2 pr-8 text-sm font-medium rounded-md cursor-pointer border-0 ring-1 ring-inset ${
                        person.role === "admin"
                          ? "bg-purple-50 text-purple-700 ring-purple-200"
                          : person.role === "staff" ||
                              person.role === "director"
                            ? "bg-green-50 text-green-700 ring-green-200"
                            : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50"
                      }`}
                      value={person.role}
                      onChange={(e) =>
                        updateMemberRole(person.id, e.target.value)
                      }
                    >
                      <option value="member">일반</option>
                      <option value="cellleader">셀리더</option>
                      <option value="campleader">진장/코치</option>
                      <option value="staff">사역자</option>
                      <option value="director">디렉터</option>
                      <option value="admin">관리자</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() =>
                        toggleApprover(person.id, person.is_approver)
                      }
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${person.is_approver ? "bg-blue-600" : "bg-gray-200"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${person.is_approver ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </td>
                  {/* ★ 연차 관리 (개선됨: onChange는 로컬반영, onBlur는 저장) */}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        className="w-16 text-center border-gray-300 rounded-md text-sm py-1 focus:ring-blue-500 focus:border-blue-500"
                        value={person.total_leave_days}
                        onChange={(e) =>
                          handleLeaveChange(
                            person.id,
                            "total_leave_days",
                            e.target.value,
                          )
                        }
                        onBlur={(e) =>
                          saveLeaveData(
                            person.id,
                            "total_leave_days",
                            parseFloat(e.target.value),
                          )
                        }
                      />
                      <span className="text-gray-400">/</span>
                      <input
                        type="number"
                        className="w-16 text-center border-gray-300 rounded-md text-sm py-1 bg-gray-50 text-gray-500"
                        value={person.used_leave_days}
                        onChange={(e) =>
                          handleLeaveChange(
                            person.id,
                            "used_leave_days",
                            e.target.value,
                          )
                        }
                        onBlur={(e) =>
                          saveLeaveData(
                            person.id,
                            "used_leave_days",
                            parseFloat(e.target.value),
                          )
                        }
                      />
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
