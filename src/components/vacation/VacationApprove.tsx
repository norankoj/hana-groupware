"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";
import { format, parseISO } from "date-fns";
import {
  VacationRequest,
  UserProfile,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  DEDUCTIBLE_TYPES,
  btnStyles,
} from "./shared";

// 간단한 정보 표시용 내부 컴포넌트
const InfoRow = ({
  label,
  value,
  isLast,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}) => (
  <div
    className={`flex border-b border-gray-200 ${isLast ? "border-b-0" : ""}`}
  >
    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
      {label}
    </div>
    <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center whitespace-pre-wrap">
      {value}
    </div>
  </div>
);

export default function VacationApprove({
  user,
  approvalList,
  onRefresh,
}: {
  user: UserProfile;
  approvalList: VacationRequest[];
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] =
    useState<VacationRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);

  const filteredApprovals = useMemo(() => {
    return approvalList.filter((req) => {
      const matchesStatus =
        filterStatus === "all" || req.status === filterStatus;
      const matchesType = filterType === "all" || req.type === filterType;
      const matchesName = req.profiles.full_name.includes(searchTerm);
      return matchesStatus && matchesType && matchesName;
    });
  }, [approvalList, filterStatus, filterType, searchTerm]);

  const handleProcess = async (isApproved: boolean) => {
    if (!selectedRequest) return;
    if (!isApproved && !rejectReason.trim())
      return toast.error("반려 사유를 입력해주세요.");

    const { data: checkData } = await supabase
      .from("vacation_requests")
      .select("status")
      .eq("id", selectedRequest.id)
      .single();

    if (checkData && checkData.status !== "pending") {
      toast.error("이미 처리된 문서입니다.");
      setIsDetailModalOpen(false);
      onRefresh();
      return;
    }

    if (
      !(await showConfirm(
        isApproved ? "승인하시겠습니까?" : "반려하시겠습니까?",
      ))
    )
      return;

    const now = new Date().toISOString(); // 현재 시간

    // 1. 승인/반려 시 날짜도 함께 업데이트
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
        approved_at: isApproved ? now : null, // 승인일
        rejected_at: isApproved ? null : now, // 반려일
      })
      .eq("id", selectedRequest.id);

    if (error) return toast.error("오류 발생: " + error.message);

    if (isApproved && DEDUCTIBLE_TYPES.includes(selectedRequest.type)) {
      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("used_leave_days")
        .eq("id", selectedRequest.user_id)
        .single();
      const currentUsed = requesterProfile?.used_leave_days || 0;
      await supabase
        .from("profiles")
        .update({ used_leave_days: currentUsed + selectedRequest.days_count })
        .eq("id", selectedRequest.user_id);
    }

    toast.success("처리되었습니다.");
    setIsDetailModalOpen(false);
    onRefresh();
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col h-[500px] sm:h-[650px] animate-fadeIn">
        {/* 필터 영역 */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 items-end">
          <div className="w-36">
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_OPTIONS}
            />
          </div>
          <div className="w-36">
            <Select
              value={filterType}
              onChange={setFilterType}
              options={TYPE_OPTIONS}
            />
          </div>
          <div className="relative w-full sm:w-64 ml-auto">
            <input
              type="text"
              placeholder="이름을 입력하세요"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 pl-10 bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-600 focus:ring-1 text-sm"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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
          </div>
        </div>

        {/* 리스트 영역 */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-gray-50 sm:bg-white p-4 sm:p-0">
          {/* 모바일 뷰 (Card) */}
          <div className="block sm:hidden space-y-3">
            {filteredApprovals.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                조건에 맞는 문서가 없습니다.
              </div>
            ) : (
              filteredApprovals.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
                    <div>
                      <div className="text-base font-bold text-gray-900">
                        {req.profiles.full_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {req.profiles.position}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        req.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : req.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {req.status === "pending"
                        ? "대기중"
                        : req.status === "approved"
                          ? "승인"
                          : "반려"}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-8">종류</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        {req.type}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-8 mt-0.5">
                        기간
                      </span>
                      <div className="text-sm text-gray-700">
                        {req.start_date} ~ {req.end_date}
                        <span className="text-xs text-gray-400 ml-1">
                          ({req.days_count}일)
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedRequest(req);
                      setIsDetailModalOpen(true);
                      setIsRejectMode(false);
                    }}
                    className="w-full text-blue-600 bg-blue-50 py-2.5 rounded-lg text-sm font-bold border border-blue-200 hover:bg-blue-100 transition active:scale-[0.98]"
                  >
                    {req.status === "pending" ? "결재하기" : "상세보기"}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* PC 뷰 (Table) */}
          <div className="hidden sm:block h-full">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    기안자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    종류
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    기간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    상태
                  </th>
                  {/* 3. 테이블에 결재자 추가 */}
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    결재자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApprovals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-gray-400">
                      조건에 맞는 문서가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredApprovals.map((req) => (
                    <tr key={req.id} className="hover:bg-blue-50/30 transition">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900">
                          {req.profiles.full_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {req.profiles.position}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                          {req.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                        {req.start_date} ~ {req.end_date}
                        <span className="text-xs text-gray-400">
                          {" "}
                          ({req.days_count}일)
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            req.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : req.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {req.status === "pending"
                            ? "대기중"
                            : req.status === "approved"
                              ? "승인"
                              : "반려"}
                        </span>
                      </td>
                      {/* 결재자 표시 */}
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {req.approver?.full_name || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsDetailModalOpen(true);
                            setIsRejectMode(false);
                          }}
                          className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded text-sm font-medium border border-blue-200 transition cursor-pointer whitespace-nowrap"
                        >
                          {req.status === "pending" ? "결재하기" : "상세보기"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 결재 상세/처리 모달 (디자인 개선됨) */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={
          selectedRequest?.status === "pending" ? "결재 처리" : "상세 내용"
        }
        footer={
          selectedRequest?.status === "pending" &&
          user?.is_approver &&
          selectedRequest.user_id !== user.id ? (
            !isRejectMode ? (
              <>
                <button
                  onClick={() => handleProcess(true)}
                  className={btnStyles.save}
                >
                  승인
                </button>
                <button
                  onClick={() => setIsRejectMode(true)}
                  className={btnStyles.delete}
                >
                  반려
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleProcess(false)}
                  className={btnStyles.delete}
                >
                  반려 확정
                </button>
                <button
                  onClick={() => {
                    setIsRejectMode(false);
                    setRejectReason("");
                  }}
                  className={btnStyles.cancel}
                >
                  취소
                </button>
              </>
            )
          ) : (
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className={btnStyles.cancel}
            >
              닫기
            </button>
          )
        }
      >
        {selectedRequest && (
          <div className="space-y-6">
            {/* 2. 상단 상태 요약 카드 & 날짜 정보 (디자인 통일) */}
            <div
              className={`flex flex-col items-center justify-center p-6 rounded-xl border ${
                selectedRequest.status === "approved"
                  ? "bg-green-50 border-green-100"
                  : selectedRequest.status === "rejected"
                    ? "bg-red-50 border-red-100"
                    : "bg-yellow-50 border-yellow-100"
              }`}
            >
              <h3
                className={`text-xl font-bold ${
                  selectedRequest.status === "approved"
                    ? "text-green-700"
                    : selectedRequest.status === "rejected"
                      ? "text-red-700"
                      : "text-yellow-700"
                }`}
              >
                {selectedRequest.status === "approved"
                  ? "승인되었습니다"
                  : selectedRequest.status === "rejected"
                    ? "반려되었습니다"
                    : "결재 대기중입니다"}
              </h3>

              <div className="mt-3 flex flex-col items-center gap-1 text-sm opacity-80">
                {selectedRequest.status === "approved" &&
                selectedRequest.approved_at ? (
                  // 1. 승인 상태이고 승인일이 있는 경우 -> 승인일만 표시
                  <span className="text-green-800 font-medium">
                    승인일:{" "}
                    {format(
                      parseISO(selectedRequest.approved_at),
                      "yyyy-MM-dd HH:mm",
                    )}
                  </span>
                ) : selectedRequest.status === "rejected" &&
                  selectedRequest.rejected_at ? (
                  // 2. 반려 상태이고 반려일이 있는 경우 -> 반려일만 표시
                  <span className="text-red-800 font-medium">
                    반려일:{" "}
                    {format(
                      parseISO(selectedRequest.rejected_at),
                      "yyyy-MM-dd HH:mm",
                    )}
                  </span>
                ) : (
                  // 3. 대기중이거나(pending) 날짜 데이터가 없는 경우 -> 신청일 표시
                  <span className="text-gray-600 font-medium">
                    신청일:{" "}
                    {selectedRequest.created_at
                      ? format(
                          parseISO(selectedRequest.created_at),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "-"}
                  </span>
                )}
              </div>
            </div>

            {/* 상세 정보 테이블 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex border-b border-gray-200">
                <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
                  기안자
                </div>
                <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {selectedRequest.profiles.full_name.slice(0, 1)}
                  </div>
                  {selectedRequest.profiles.full_name}
                  <span className="text-gray-400 text-xs">
                    ({selectedRequest.profiles.position})
                  </span>
                </div>
              </div>
              {selectedRequest.status !== "pending" && (
                <InfoRow
                  label="신청일"
                  value={
                    selectedRequest.created_at
                      ? format(
                          parseISO(selectedRequest.created_at),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "-"
                  }
                />
              )}

              <InfoRow label="휴가 구분" value={selectedRequest.type} />
              <InfoRow
                label="기간"
                value={`${selectedRequest.start_date} ~ ${selectedRequest.end_date}`}
              />
              <InfoRow
                label="사용 일수"
                value={`${selectedRequest.days_count}일`}
              />
              <InfoRow
                label="신청 사유"
                value={selectedRequest.reason}
                isLast={selectedRequest.status === "pending" && !isRejectMode}
              />

              {/* 결재자 정보 */}
              {selectedRequest.status !== "pending" && (
                <>
                  <div className="flex border-t border-gray-200 border-b border-gray-200">
                    <div className="w-32 bg-gray-50 p-3 text-sm font-bold text-gray-600 flex items-center justify-center border-r border-gray-200">
                      결재자
                    </div>
                    <div className="flex-1 bg-white p-3 text-sm text-gray-800 flex items-center gap-2">
                      {selectedRequest.approver ? (
                        <>
                          <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">
                            {selectedRequest.approver.full_name.slice(0, 1)}
                          </div>
                          {selectedRequest.approver.full_name}
                        </>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>

                  {selectedRequest.status === "rejected" && (
                    <div className="flex border-b-0">
                      <div className="w-32 bg-red-50 p-3 text-sm font-bold text-red-600 flex items-center justify-center border-r border-gray-200">
                        반려 사유
                      </div>
                      <div className="flex-1 bg-white p-3 text-sm text-red-600 font-medium">
                        {selectedRequest.rejection_reason}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {isRejectMode && (
              <div className="mt-4 animate-fadeIn">
                <label className="block text-sm font-medium text-red-600 mb-2">
                  반려 사유 입력
                </label>
                <textarea
                  className="w-full p-3 border border-red-200 rounded-md outline-none focus:ring-1 focus:ring-red-400 bg-red-50/50 text-sm font-normal text-gray-800 resize-none"
                  rows={3}
                  placeholder="반려 사유를 입력하세요."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
