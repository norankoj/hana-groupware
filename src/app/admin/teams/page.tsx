"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useCurrentMenu } from "@/components/ClientLayout";
import toast from "react-hot-toast";
import { showConfirm } from "@/utils/alert";

type Profile = {
  id: string;
  email: string | null;
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
  staff: "사역자",
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

  // ★ 동시성 제어: 입력 시작 당시의 값을 기억할 변수
  const [focusValue, setFocusValue] = useState<number | null>(null);

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

  const handleSystemReload = async () => {
    const isConfirmed = await showConfirm(
      "페이지를 새로고침 하시겠습니까?",
      "변경사항이 메뉴와 헤더에 즉시 반영됩니다.",
    );

    if (isConfirmed) {
      window.location.reload();
    }
  };

  // --- 업데이트 함수들 ---

  const updateMemberTeam = async (userId: string, teamId: string) => {
    const value = teamId === "none" ? null : parseInt(teamId);

    // DB 업데이트
    const { error } = await supabase
      .from("profiles")
      .update({ team_id: value })
      .eq("id", userId);

    if (error) {
      toast.error("변경 실패: " + error.message);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, team_id: value } : p)),
    );
    toast.success("팀이 변경되었습니다.");
  };

  const updateMemberRole = async (userId: string, newRole: string) => {
    const newPosition = ROLE_TO_POSITION[newRole] || "성도";

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole, position: newPosition })
      .eq("id", userId);

    if (error) {
      toast.error("권한 변경 실패: " + error.message);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === userId ? { ...p, role: newRole, position: newPosition } : p,
      ),
    );
    toast.success("권한이 변경되었습니다.");
  };

  const toggleApprover = async (userId: string, currentValue: boolean) => {
    // 토글 시점에도 최신 상태 확인 (가볍게 처리)
    const { error } = await supabase
      .from("profiles")
      .update({ is_approver: !currentValue })
      .eq("id", userId);

    if (error) {
      toast.error("변경 실패: " + error.message);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === userId ? { ...p, is_approver: !currentValue } : p,
      ),
    );
    toast.success("결재 권한이 변경되었습니다.");
  };

  // 입력 필드 값 변경 핸들러 (UI만 업데이트)
  const handleLeaveChange = (
    userId: string,
    field: "total_leave_days" | "used_leave_days",
    value: string,
  ) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, [field]: numValue } : p)),
    );
  };

  // ★ 포커스 시점의 원본 값 저장 (동시성 체크용)
  const handleFocus = (value: number) => {
    setFocusValue(value);
  };

  // ★ 저장 시점: 동시성 충돌 체크 로직 적용
  const saveLeaveData = async (
    userId: string,
    field: "total_leave_days" | "used_leave_days",
    value: number,
  ) => {
    // 1. 변경된 내용이 없으면 스킵
    if (focusValue === value) return;

    // 2. 저장하기 전, DB의 최신 값을 가져옴 (Double Check)
    const { data: latestData, error: fetchError } = await supabase
      .from("profiles")
      .select(field)
      .eq("id", userId)
      .single();

    if (fetchError || !latestData) {
      toast.error("최신 정보를 불러오지 못했습니다.");
      return;
    }

    const dbValue = latestData[field];

    // 3. 충돌 감지: 내가 수정을 시작했을 때의 값(focusValue)과 현재 DB값(dbValue)이 다르면?
    // -> 누군가 그 사이에 수정한 것임!
    if (focusValue !== null && dbValue !== focusValue) {
      const isConfirmed = await showConfirm(
        "⚠️ 데이터 충돌 감지",
        `다른 관리자가 이 값을 '${dbValue}'(으)로 변경했습니다.\n지금 입력한 '${value}'(으)로 덮어쓰시겠습니까?`,
      );

      if (!isConfirmed) {
        // 취소 시 UI를 DB 최신값으로 되돌림
        setProfiles((prev) =>
          prev.map((p) => (p.id === userId ? { ...p, [field]: dbValue } : p)),
        );
        toast("최신 값으로 새로고침 되었습니다.", { icon: "🔄" });
        return;
      }
    }

    // 4. 안전하게 저장 (또는 덮어쓰기 승인 후 저장)
    const { error } = await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("id", userId);

    if (error) {
      toast.error("저장 실패: " + error.message);
    } else {
      toast.success("저장되었습니다.");
    }

    // 포커스 값 초기화
    setFocusValue(null);
  };

  // 회원 탈퇴(삭제)
  const handleDeleteUser = async (userId: string, userName: string) => {
    const isConfirmed = await showConfirm(
      "회원 강제 탈퇴",
      `정말 '${userName}' 님을 탈퇴(삭제)시키겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
    );

    if (!isConfirmed) return;

    const { error } = await supabase.from("profiles").delete().eq("id", userId);

    if (error) {
      toast.error("삭제 실패: 이미 삭제되었거나 권한이 없습니다.");
      // 목록 새로고침으로 싱크 맞춤
      fetchData();
    } else {
      toast.success("성공적으로 삭제되었습니다.");
      setProfiles((prev) => prev.filter((p) => p.id !== userId));
    }
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
            결재가능 - 시스템권한: 관리자/디렉터 & 결재권한ON
          </p>
        </div>
        <button
          onClick={handleSystemReload}
          className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition flex items-center justify-center gap-2 shadow-sm"
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
          시스템 반영
        </button>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-sm sm:text-base font-bold text-gray-800">
            전체 구성원 명단 ({profiles.length}명)
          </h2>
          <button
            onClick={fetchData}
            className="text-xs text-blue-600 hover:underline"
          >
            목록 새로고침
          </button>
        </div>

        {/* --- [모바일용] 카드 리스트 뷰 --- */}
        <div className="block md:hidden bg-gray-50 divide-y divide-gray-200">
          {profiles.map((person) => (
            <div key={person.id} className="p-4 bg-white space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm border border-gray-200">
                    {person.full_name.slice(0, 1)}
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-bold text-gray-900">
                      {person.full_name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {person.email || "이메일 없음"}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {person.position}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUser(person.id, person.full_name)}
                  className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-100"
                >
                  강제 탈퇴
                </button>
              </div>

              {/* 설정 컨트롤 영역 */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    소속 팀
                  </label>
                  <select
                    className="block w-full py-2 px-2 text-sm border-gray-300 rounded-md bg-white"
                    value={person.team_id || "none"}
                    onChange={(e) =>
                      updateMemberTeam(person.id, e.target.value)
                    }
                  >
                    <option value="none">소속 없음</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    시스템 권한
                  </label>
                  <select
                    className="block w-full py-2 px-2 text-sm border-gray-300 rounded-md bg-white"
                    value={person.role}
                    onChange={(e) =>
                      updateMemberRole(person.id, e.target.value)
                    }
                  >
                    <option value="member">일반</option>
                    <option value="staff">사역자</option>
                    <option value="admin">관리자</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    결재 권한
                  </span>
                  <button
                    onClick={() =>
                      toggleApprover(person.id, person.is_approver)
                    }
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${person.is_approver ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${person.is_approver ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                </div>

                {/* 연차 관리 */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 mr-1">
                    연차(총/사용)
                  </span>
                  <input
                    type="number"
                    className="w-10 text-center border-gray-300 rounded-md text-xs py-1"
                    value={person.total_leave_days}
                    onFocus={() => handleFocus(person.total_leave_days)}
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
                  <span className="text-gray-300">/</span>
                  <input
                    type="number"
                    className="w-10 text-center border-gray-300 rounded-md text-xs py-1 bg-gray-50 text-gray-500"
                    value={person.used_leave_days}
                    onFocus={() => handleFocus(person.used_leave_days)}
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
              </div>
            </div>
          ))}
        </div>

        {/* --- [PC용] 테이블 뷰 --- */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  이름 / 직분
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  ID (이메일)
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
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">
                  연차 (총/사용)
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                  관리
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
                    <span className="text-sm text-gray-500">
                      {person.email || "-"}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      className="block w-full py-1.5 pl-2 pr-8 text-sm border-gray-300 rounded-md bg-white cursor-pointer"
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
                      className={`block w-full py-1.5 pl-2 pr-8 text-sm font-medium rounded-md cursor-pointer border-0 ring-1 ring-inset ${person.role === "admin" ? "bg-purple-50 text-purple-700 ring-purple-200" : person.role === "staff" || person.role === "director" ? "bg-green-50 text-green-700 ring-green-200" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50"}`}
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
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        className="w-12 text-center border-gray-300 rounded-md text-sm py-1 focus:ring-blue-500 focus:border-blue-500"
                        value={person.total_leave_days}
                        onFocus={() => handleFocus(person.total_leave_days)}
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
                        className="w-12 text-center border-gray-300 rounded-md text-sm py-1 bg-gray-50 text-gray-500"
                        value={person.used_leave_days}
                        onFocus={() => handleFocus(person.used_leave_days)}
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
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() =>
                        handleDeleteUser(person.id, person.full_name)
                      }
                      className="text-red-500 hover:text-red-700 font-medium text-xs border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition"
                    >
                      탈퇴
                    </button>
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
