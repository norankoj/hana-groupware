// src/app/admin/salary/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

export default function AdminUploadPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [month, setMonth] = useState("2026-02");

  const [docType, setDocType] = useState<"salary" | "mission">("salary");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, position")
        .order("full_name");
      if (data) setUsers(data);
    };
    fetchUsers();

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }
    const MAX_SIZE = 3 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      toast.error("파일 용량이 너무 큽니다! (3MB 이하만 가능)");
      e.target.value = "";
      setFile(null);
    } else {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!selectedUser || !file || !month)
      return toast.error("모든 항목을 선택해주세요.");
    setUploading(true);

    try {
      const prefix = docType === "salary" ? "salary" : "mission";
      const filePath = `${selectedUser}/${prefix}_${month}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("salary-docs")
        .upload(filePath, file, {
          upsert: true,
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      const tableName = docType === "salary" ? "salary_stubs" : "mission_funds";
      const { error: dbError } = await supabase.from(tableName).insert({
        user_id: selectedUser,
        month: month,
        file_url: filePath,
      });

      if (dbError) throw dbError;

      toast.success(
        `${docType === "salary" ? "급여명세서" : "선교펀드"} 등록 완료!`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast.error("실패: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const borderColor =
    docType === "salary" ? "border-blue-400" : "border-gray-400";
  const bgColor = docType === "salary" ? "bg-blue-50" : "bg-gray-50";
  const textColor = docType === "salary" ? "text-blue-600" : "text-gray-600";
  const btnHoverColor =
    docType === "salary" ? "hover:bg-blue-700" : "hover:bg-gray-700";
  const btnBgColor = docType === "salary" ? "bg-blue-600" : "bg-gray-600";
  const dotColor = docType === "salary" ? "bg-blue-500" : "bg-gray-500";

  const filteredUsers = users.filter(
    (u) => u.full_name.includes(searchTerm) || u.position.includes(searchTerm),
  );
  const selectedUserName = users.find((u) => u.id === selectedUser)?.full_name;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-8 pb-32">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          문서 개별 업로드
        </h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-visible">
        <div className="px-5 py-4 sm:px-8 sm:py-5 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-bold text-gray-800">
            업로드 정보 입력
          </h2>
        </div>

        <div className="p-5 sm:p-8 space-y-8">
          {/* 1. [대상자/월] 입력 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-20">
            {/* 대상자 검색 */}
            <div ref={dropdownRef} className="relative">
              <label className="flex items-center gap-1 mb-2">
                <span className="text-sm font-bold text-gray-700">
                  대상자 검색
                </span>
              </label>

              <div
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full border rounded-lg py-3 px-4 text-sm bg-white flex justify-between items-center cursor-pointer ${isDropdownOpen ? "ring-2 ring-blue-500 border-blue-500" : "border-gray-300"}`}
              >
                <span
                  className={
                    selectedUser ? "text-gray-900 font-bold" : "text-gray-400"
                  }
                >
                  {selectedUser
                    ? `${selectedUserName} 님`
                    : "이름을 검색하거나 선택하세요"}
                </span>
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-gray-100 bg-gray-50">
                    <input
                      autoFocus
                      type="text"
                      placeholder="이름 검색..."
                      className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {filteredUsers.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-400">
                        검색 결과가 없습니다.
                      </div>
                    ) : (
                      filteredUsers.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setSelectedUser(u.id);
                            setIsDropdownOpen(false);
                            setSearchTerm("");
                          }}
                          className={`px-4 py-3 text-sm cursor-pointer hover:bg-blue-50 transition flex justify-between items-center ${selectedUser === u.id ? "bg-blue-50 text-blue-600 font-bold" : "text-gray-700"}`}
                        >
                          <span>{u.full_name}</span>
                          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                            {u.position}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 귀속 월 */}
            <div>
              <label className="flex items-center gap-1 mb-2">
                <span className="text-sm font-bold text-gray-700">귀속 월</span>
              </label>
              <input
                type="month"
                className="w-full border border-gray-300 rounded-lg py-3 px-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          </div>

          {/* 2. 문서 종류 선택 (모바일 수정됨: flex-col 추가) */}
          <div className="relative z-10">
            <label className="flex items-center gap-1 mb-3">
              <span className="text-sm font-bold text-gray-700">문서 종류</span>
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mb-1"></span>
            </label>
            {/* ★ 여기가 수정된 부분: 모바일(기본)은 세로, sm(큰화면)은 가로 */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <label
                className={`flex-1 border rounded-lg p-4 cursor-pointer transition flex items-center gap-3 ${docType === "salary" ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <input
                  type="radio"
                  name="docType"
                  value="salary"
                  checked={docType === "salary"}
                  onChange={() => setDocType("salary")}
                  className="w-5 h-5 text-blue-600"
                />
                <div>
                  <div className="font-bold text-gray-800">급여명세서</div>
                  <div className="text-xs text-gray-500">
                    매월 지급되는 급여 내역
                  </div>
                </div>
              </label>
              <label
                className={`flex-1 border rounded-lg p-4 cursor-pointer transition flex items-center gap-3 ${docType === "mission" ? "border-gray-500 bg-gray-50 ring-1 ring-gray-500" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <input
                  type="radio"
                  name="docType"
                  value="mission"
                  checked={docType === "mission"}
                  onChange={() => setDocType("mission")}
                  className="w-5 h-5 text-gray-600"
                />
                <div>
                  <div className="font-bold text-gray-800">선교펀드</div>
                  <div className="text-xs text-gray-500">
                    선교 후원금 내역 조회
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 3. 파일 첨부 영역 */}
          <div className="relative z-0">
            <div className="flex items-center gap-1 mb-3">
              <span className="text-sm font-bold text-gray-700">PDF 파일</span>
              <span
                className={`w-1.5 h-1.5 rounded-full mb-1 ${dotColor}`}
              ></span>
            </div>
            {/* 패딩 조정: p-10 -> p-6 sm:p-10 */}
            <div
              className={`border rounded-xl p-6 sm:p-10 flex flex-col items-center justify-center text-center transition-colors ${file ? `${borderColor} ${bgColor}` : `border-cyan-400 bg-white`}`}
            >
              {file ? (
                <div className="animate-fadeIn">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 bg-white shadow-sm`}
                  >
                    <svg
                      className={`w-8 h-8 ${textColor}`}
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
                  <p className="text-gray-900 font-bold text-lg mb-1">
                    {file.name}
                  </p>
                  <p className={`text-sm ${textColor} font-medium mb-4`}>
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-sm text-gray-400 underline hover:text-red-500 transition-colors"
                  >
                    파일 삭제 후 다시 선택
                  </button>
                </div>
              ) : (
                <div className="animate-fadeIn">
                  <div className="w-12 h-12 mx-auto mb-4 text-cyan-500 bg-cyan-50 rounded-full flex items-center justify-center">
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-cyan-600 mb-1">
                    {docType === "salary" ? "급여명세서" : "선교펀드"} 파일을
                    첨부하면 자동으로 처리됩니다.
                  </p>
                  <p className="text-xs text-gray-400 mb-6">
                    가능한 PDF 파일(.pdf)로 첨부 바랍니다.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-400 shadow-sm transition-all flex items-center gap-2 mx-auto"
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
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    파일 첨부
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* 4. 최종 업로드 버튼 */}
          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className={`w-full sm:w-auto px-8 py-3 rounded-lg text-sm font-bold text-white shadow-md transition ${uploading ? "bg-gray-400" : `${btnBgColor} ${btnHoverColor}`}`}
            >
              {uploading ? "업로드 중..." : "등록 완료"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
