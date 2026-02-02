"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";
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

    const { error } = await supabase
      .from("vacation_requests")
      .update({
        status: isApproved ? "approved" : "rejected",
        approver_id: user?.id,
        rejection_reason: isApproved ? null : rejectReason,
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

        {/* 리스트 영역 (모바일: 카드 / PC: 테이블) */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar bg-gray-50 sm:bg-white p-4 sm:p-0">
          {/* 1. 모바일 뷰 (Card Layout) - md:hidden */}
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
                  {/* 헤더: 이름/직급 + 상태 */}
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

                  {/* 바디: 종류, 기간 */}
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

                  {/* 푸터: 버튼 */}
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

          {/* 2. PC 뷰 (Table Layout) - hidden sm:block */}
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApprovals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-gray-400">
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

      {/* 결재 상세/처리 모달 */}
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
          <div className="space-y-4">
            <div className="border border-gray-200 overflow-hidden">
              <InfoRow
                label="기안자"
                value={`${selectedRequest.profiles.full_name} (${selectedRequest.profiles.position})`}
              />
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
            </div>

            {selectedRequest.status !== "pending" && (
              <div className="border border-gray-200 overflow-hidden">
                <InfoRow
                  label="결재 상태"
                  value={
                    <span
                      className={`font-bold ${
                        selectedRequest.status === "approved"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {selectedRequest.status === "approved" ? "승인" : "반려"}
                    </span>
                  }
                />
                <InfoRow
                  label="결재자"
                  value={selectedRequest.approver?.full_name || "-"}
                  isLast={selectedRequest.status === "approved"}
                />
                {selectedRequest.status === "rejected" && (
                  <InfoRow
                    label="반려 사유"
                    value={selectedRequest.rejection_reason}
                    isLast={true}
                  />
                )}
              </div>
            )}

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
