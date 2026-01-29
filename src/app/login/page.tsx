// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";
import { showConfirm } from "@/utils/alert";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // 화면 모드: 'login' 또는 'signup'
  const [view, setView] = useState<"login" | "signup">("login");

  // 본인인증 완료 여부 상태
  const [isVerified, setIsVerified] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("셀리더");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 입력값 및 상태 초기화 함수
  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setPosition("셀리더");
    setPhone("");
    setErrorMsg("");
    setIsVerified(false); // 인증 상태도 초기화
  };

  // 모드 전환 함수
  const toggleView = () => {
    setView(view === "login" ? "signup" : "login");
    resetForm();
  };

  // 모의 본인인증 처리 함수
  const handleIdentityVerification = async () => {
    // 💡 나중에 여기에 포트원(PortOne) 등 실제 인증 API 코드를 넣으면 됩니다.
    // const mockUser = {
    //   name: "노나연",
    //   phone: "010-1234-5678",
    //   // gender: "female",
    // };

    if (
      await showConfirm(
        "본인인증",
        "휴대폰 본인인증을 진행하시겠습니까? (모의 테스트)",
      )
    ) {
      toast.success("본인인증이 완료되었습니다.");
      setIsVerified(true); // 인증 완료 상태로 변경

      // setName(mockUser.name);
      // setPhone(mockUser.phone);
    }
  };

  // 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("로그인 실패: 아이디나 비밀번호를 확인해주세요.");
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  // 회원가입 처리
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    // 이제 emailRedirectTo 옵션은 필요 없습니다.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          position: position,
          phone: phone,
          role: "member",
          status: "active",
        },
      },
    });

    if (error) {
      setErrorMsg("가입 신청 실패: " + error.message);
    } else {
      toast.success("회원가입이 완료되었습니다! \n환영합니다.");

      // Supabase 설정에서 이메일 인증을 껐기 때문에,
      // 가입과 동시에 세션이 생성되어 로그인이 된 상태입니다.
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl">
        {/* 로고 영역 */}
        <div className="text-center flex flex-col items-center">
          <img
            src="/images/mainlogo.jpg"
            alt="수원하나교회"
            className="h-16 w-auto mb-10"
          />
        </div>

        {/* ---------------------------------------------------------------
            1. 로그인 화면
           --------------------------------------------------------------- */}
        {view === "login" && (
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md space-y-4">
              {errorMsg && (
                <div className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded-md">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  required
                  className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition duration-200"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호
                </label>
                <input
                  type="password"
                  required
                  className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition duration-200"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md transition duration-200"
              >
                {loading ? "처리 중..." : "로그인"}
              </button>
              <div className="text-center mt-2">
                <span className="text-sm text-gray-600">
                  계정이 없으신가요?{" "}
                </span>
                <button
                  type="button"
                  onClick={toggleView}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 ml-2"
                >
                  회원가입 신청
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ---------------------------------------------------------------
            2. 회원가입 화면
           --------------------------------------------------------------- */}
        {view === "signup" && (
          <div className="mt-8 space-y-6">
            {/* STEP 1: 본인인증 전 (인증 버튼만 보임) */}
            {!isVerified ? (
              <div className="text-center space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium">
                    안전한 그룹웨어 사용을 위해
                    <br />
                    본인인증이 필요합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleIdentityVerification}
                  className="w-full flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition duration-200"
                >
                  휴대폰 본인인증 하기
                </button>
                <button
                  type="button"
                  onClick={toggleView}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  취소하고 돌아가기
                </button>
              </div>
            ) : (
              /* STEP 2: 본인인증 후 (입력폼 보임) */
              <form onSubmit={handleSignUp}>
                <div className="rounded-md space-y-4">
                  {errorMsg && (
                    <div className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded-md">
                      {errorMsg}
                    </div>
                  )}

                  {/* 인증 완료 표시 */}
                  <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200 mb-4">
                    <span className="text-sm font-bold text-green-700">
                      ✅ 본인인증 완료
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsVerified(false)}
                      className="text-xs text-gray-500 underline"
                    >
                      재인증
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      이름
                    </label>
                    <input
                      type="text"
                      required
                      className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Select
                      label="직분"
                      value={position}
                      onChange={(val) => setPosition(val)}
                      options={[
                        "셀리더",
                        "진장/코치",
                        "사역자",
                        "디렉터",
                        "일반",
                      ]}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      전화번호
                    </label>
                    <input
                      id="phone"
                      type="text"
                      inputMode="numeric"
                      className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      value={phone}
                      placeholder="010-1234-5678"
                      maxLength={13}
                      onChange={(e) => {
                        // 숫자만 추출
                        const rawValue = e.target.value.replace(/[^0-9]/g, "");
                        let formattedValue = "";

                        // 하이픈 자동 포맷팅 로직
                        if (rawValue.length < 4) {
                          formattedValue = rawValue;
                        } else if (rawValue.length < 8) {
                          formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3)}`;
                        } else {
                          formattedValue = `${rawValue.slice(0, 3)}-${rawValue.slice(3, 7)}-${rawValue.slice(7, 11)}`;
                        }

                        setPhone(formattedValue);
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      이메일 (아이디)
                    </label>
                    <input
                      type="email"
                      required
                      className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      placeholder="test@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      비밀번호
                    </label>
                    <input
                      type="password"
                      required
                      className="appearance-none rounded-lg block w-full px-4 py-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      placeholder="6자리 이상"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md transition duration-200"
                  >
                    {loading ? "처리 중..." : "가입 신청하기"}
                  </button>
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={toggleView}
                      className="text-sm font-bold text-gray-500 hover:text-gray-800"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
