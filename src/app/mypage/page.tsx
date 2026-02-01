// src/app/mypage/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Script from "next/script";

// Daum 우편번호 서비스 타입 선언
declare global {
  interface Window {
    daum: any;
  }
}

// 프로필 데이터 타입
type Profile = {
  id: string;
  full_name: string;
  email: string;
  position: string;
  role: string;
  phone: string;

  // 추가된 컬럼들
  birth_date?: string;
  address?: string; // 기본 주소
  detailed_address?: string; // 상세 주소
  zipcode?: string; // 우편번호
  vehicle_number?: string; // 차량 번호

  teams: { name: string } | null;
};

// 문서(급여/선교) 데이터 타입
type DocStub = {
  id: number;
  month: string;
  file_url: string;
  created_at: string;
};

export default function MyPage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [salaries, setSalaries] = useState<DocStub[]>([]);
  const [missions, setMissions] = useState<DocStub[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);

  // 수정 폼 상태
  const [editForm, setEditForm] = useState({
    phone: "",
    birth_date: "",
    address: "",
    detailed_address: "",
    zipcode: "",
    vehicle_number: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // 1. 프로필 가져오기
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*, teams:team_id(name)")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile({
          ...profileData,
          email: user.email!,
          teams: profileData.teams,
        });
        // 수정 폼 초기값 설정
        setEditForm({
          phone: profileData.phone || "",
          birth_date: profileData.birth_date || "",
          address: profileData.address || "",
          detailed_address: profileData.detailed_address || "",
          zipcode: profileData.zipcode || "",
          vehicle_number: profileData.vehicle_number || "",
        });
      }

      // 2. 급여명세서 가져오기
      const { data: salaryData } = await supabase
        .from("salary_stubs")
        .select("*")
        .eq("user_id", user.id)
        .order("month", { ascending: false });
      if (salaryData) setSalaries(salaryData);

      // 3. 선교펀드 가져오기
      const { data: missionData } = await supabase
        .from("mission_funds")
        .select("*")
        .eq("user_id", user.id)
        .order("month", { ascending: false });
      if (missionData) setMissions(missionData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 프로필 업데이트
  const handleUpdateProfile = async () => {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        phone: editForm.phone,
        birth_date: editForm.birth_date,
        address: editForm.address,
        detailed_address: editForm.detailed_address,
        zipcode: editForm.zipcode,
        vehicle_number: editForm.vehicle_number,
      })
      .eq("id", profile.id);

    if (error) {
      toast.error("수정 실패: " + error.message);
    } else {
      toast.success("정보가 저장되었습니다.");
      setProfile({ ...profile, ...editForm });
      setIsEditing(false);
    }
  };

  // 다음 주소 찾기 팝업
  const openPostcode = () => {
    if (!window.daum || !window.daum.Postcode) {
      toast.error(
        "주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
      );
      return;
    }

    new window.daum.Postcode({
      oncomplete: function (data: any) {
        setEditForm((prev) => ({
          ...prev,
          zipcode: data.zonecode,
          address: data.address, // 도로명 주소
          detailed_address: "", // 주소 변경 시 상세주소 초기화
        }));
        // 상세주소 칸으로 포커스 이동
        document.getElementById("detailed-address-input")?.focus();
      },
    }).open();
  };

  // 미리보기 (Blob 방식)
  const handlePreview = async (path: string) => {
    const toastId = toast.loading("문서 여는 중...");
    try {
      const { data, error } = await supabase.storage
        .from("salary-docs")
        .download(path);
      if (error) throw error;
      if (data) {
        const blob = new Blob([data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        toast.dismiss(toastId);
      }
    } catch (e) {
      toast.dismiss(toastId);
      toast.error("미리보기 실패");
    }
  };

  // 다운로드 (Blob 방식)
  const handleDownload = async (path: string, fileName: string) => {
    const toastId = toast.loading("다운로드 중...");
    try {
      const { data, error } = await supabase.storage
        .from("salary-docs")
        .download(path);
      if (error) throw error;
      if (data) {
        const url = window.URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.dismiss(toastId);
        toast.success("다운로드 완료");
      }
    } catch (e) {
      toast.dismiss(toastId);
      toast.error("다운로드 실패");
    }
  };

  // 문서 카드 컴포넌트 (급여: 파랑 / 선교: 회색)
  const DocCard = ({
    doc,
    type,
  }: {
    doc: DocStub;
    type: "salary" | "mission";
  }) => {
    const iconBg = type === "salary" ? "bg-blue-50" : "bg-gray-100";
    const iconColor = type === "salary" ? "text-blue-600" : "text-gray-600";
    const btnText = type === "salary" ? "text-blue-600" : "text-gray-700";
    const btnBg =
      type === "salary"
        ? "bg-blue-600 hover:bg-blue-700"
        : "bg-gray-600 hover:bg-gray-700";
    const previewBg =
      type === "salary"
        ? "bg-blue-50 hover:bg-blue-100 border-blue-100"
        : "bg-gray-50 hover:bg-gray-100 border-gray-200";

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition flex flex-col justify-between group">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg} ${iconColor}`}
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-gray-800">
              {doc.month} {type === "salary" ? "명세서" : "선교펀드"}
            </h3>
            <p className="text-xs text-gray-500">
              {doc.created_at.substring(0, 10)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full">
          <button
            onClick={() => handlePreview(doc.file_url)}
            className={`flex-1 py-2 text-sm font-bold ${btnText} ${previewBg} border rounded transition`}
          >
            미리보기
          </button>
          <button
            onClick={() =>
              handleDownload(
                doc.file_url,
                `${doc.month}_${type === "salary" ? "급여명세서" : "선교펀드"}.pdf`,
              )
            }
            className={`flex-1 py-2 text-sm font-bold rounded transition text-white ${btnBg}`}
          >
            다운로드
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-10 text-center">로딩 중...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-20">
      {/* 다음 주소 API 로드 */}
      <Script
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="lazyOnload"
      />

      <h1 className="text-2xl font-bold text-gray-900">내 정보 관리</h1>

      {/* 1. 기본 정보 섹션 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">기본 정보</h2>
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleUpdateProfile}
                className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded hover:bg-blue-100"
            >
              정보 수정
            </button>
          )}
        </div>
        <div className="p-6">
          <div className="border border-gray-200 rounded-sm">
            <InfoRow label="이름" value={profile?.full_name} />
            <InfoRow
              label="소속 / 직분"
              value={`${profile?.teams?.name || "미배정"} | ${profile?.position || ""}`}
            />
            <InfoRow label="이메일" value={profile?.email} />

            {/* 전화번호 */}
            <InfoRow
              label="전화번호 *"
              value={
                isEditing ? (
                  <input
                    className="border border-gray-300 p-2 rounded w-full sm:w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    placeholder="010-0000-0000"
                  />
                ) : (
                  profile?.phone
                )
              }
            />

            {/* 생년월일 */}
            <InfoRow
              label="생년월일 *"
              value={
                isEditing ? (
                  <input
                    type="date"
                    className="border border-gray-300 p-2 rounded w-full sm:w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={editForm.birth_date}
                    onChange={(e) =>
                      setEditForm({ ...editForm, birth_date: e.target.value })
                    }
                  />
                ) : (
                  profile?.birth_date
                )
              }
            />

            {/* 주소 (검색 기능) */}
            <div className="flex flex-col sm:flex-row border-b border-gray-200 last:border-b-0">
              <div className="w-full sm:w-48 bg-gray-50 p-4 text-sm font-bold text-gray-600 flex items-center border-b sm:border-b-0 sm:border-r border-gray-200">
                집 주소 *
              </div>
              <div className="flex-1 p-4 text-sm text-gray-900">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        placeholder="우편번호"
                        value={editForm.zipcode}
                        className="border border-gray-300 p-2 rounded w-24 bg-gray-50 text-gray-500"
                      />
                      <button
                        onClick={openPostcode}
                        className="px-3 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 text-xs font-bold flex items-center gap-1"
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
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        주소 검색
                      </button>
                    </div>
                    <input
                      type="text"
                      readOnly
                      placeholder="주소 검색 버튼을 눌러주세요"
                      value={editForm.address}
                      onClick={openPostcode}
                      className="border border-gray-300 p-2 rounded w-full bg-gray-50 cursor-pointer"
                    />
                    <input
                      id="detailed-address-input"
                      type="text"
                      placeholder="상세 주소 (예: 101동 101호) - 선택사항"
                      value={editForm.detailed_address}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          detailed_address: e.target.value,
                        })
                      }
                      className="border border-gray-300 p-2 rounded w-full focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    {profile?.address ? (
                      <>
                        <span className="block text-gray-800">
                          ({profile.zipcode}) {profile.address}
                        </span>
                        {profile.detailed_address && (
                          <span className="block text-gray-600 mt-1">
                            {profile.detailed_address}
                          </span>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 차량 번호 */}
            <InfoRow
              label="차량번호"
              value={
                isEditing ? (
                  <div className="w-full">
                    <input
                      className="border border-gray-300 p-2 rounded w-full focus:ring-2 focus:ring-blue-500 outline-none"
                      value={editForm.vehicle_number}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          vehicle_number: e.target.value,
                        })
                      }
                      placeholder="예) 12가 3456 (흰색 아반떼)"
                    />
                  </div>
                ) : (
                  profile?.vehicle_number || "-"
                )
              }
            />
          </div>
        </div>
      </div>

      {/* 2. 급여명세서 섹션 (파란색) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">급여명세서 조회</h2>
          <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">
            본인만 확인 가능 🔒
          </span>
        </div>
        <div className="p-6 bg-gray-50/30 max-h-96 overflow-y-auto custom-scrollbar">
          {salaries.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              내역 없음
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {salaries.map((doc) => (
                <DocCard key={doc.id} doc={doc} type="salary" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. 선교펀드 섹션 (회색) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">선교펀드 조회</h2>
          <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">
            본인만 확인 가능 🔒
          </span>
        </div>
        <div className="p-6 bg-gray-50/30 max-h-96 overflow-y-auto custom-scrollbar">
          {missions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              내역 없음
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {missions.map((doc) => (
                <DocCard key={doc.id} doc={doc} type="mission" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 정보 표시 행 컴포넌트
const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row border-b border-gray-200 last:border-b-0">
    <div className="w-full sm:w-48 bg-gray-50 p-4 text-sm font-bold text-gray-600 flex items-center border-b sm:border-b-0 sm:border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 p-4 text-sm text-gray-900 font-medium flex items-center">
      {value || "-"}
    </div>
  </div>
);
