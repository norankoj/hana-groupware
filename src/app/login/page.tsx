"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState<"login" | "signup">("login");

  // --- 상태 관리 ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("사역자");

  // 인증 관련 상태
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [phone, setPhone] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 타이머 로직
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCodeSent && !isVerified && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCodeSent, isVerified, timeLeft]);

  // 초기화
  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setPosition("사역자");
    setPhone("");
    setVerifyCode("");
    setErrorMsg("");
    setIsVerificationStarted(false);
    setIsCodeSent(false);
    setIsVerified(false);
    setTimeLeft(180);
  };

  const toggleView = () => {
    setView(view === "login" ? "signup" : "login");
    resetForm();
  };

  // 문자 발송
  const handleSendCode = async () => {
    if (!phone || phone.length < 10)
      return toast.error("휴대폰 번호를 정확히 입력해주세요.");
    const cleanPhone = phone.replace(/-/g, "");

    setLoading(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");

      toast.success("인증번호가 발송되었습니다.");
      setIsCodeSent(true);
      setTimeLeft(180);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 인증번호 확인
  const handleVerifyCode = async () => {
    if (!verifyCode) return toast.error("인증번호를 입력해주세요.");
    const cleanPhone = phone.replace(/-/g, "");

    setLoading(true);

    try {
      const res = await fetch("/api/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code: verifyCode }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "인증 실패");

      toast.success("본인인증 성공!");
      setIsVerified(true);
      setIsCodeSent(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setErrorMsg("로그인 실패: 정보를 확인해주세요.");
    else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  // 회원가입
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerified) return toast.error("휴대폰 인증을 완료해주세요.");

    setLoading(true);
    setErrorMsg("");
    const cleanPhone = phone.replace(/-/g, "");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          position,
          phone: cleanPhone,
          phone_verified: true,
          role: "member",
          status: "active",
        },
      },
    });

    if (error) setErrorMsg("가입 실패: " + error.message);
    else {
      toast.success("가입 완료! 환영합니다.");
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  const formatPhone = (val: string) => {
    const raw = val.replace(/[^0-9]/g, "");
    if (raw.length < 4) return raw;
    if (raw.length < 8) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
    return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // --- 공통 스타일 정의 ---

  // 1. 라벨 스타일
  const labelStyle = "block text-sm font-bold text-gray-600 mb-1.5 ml-1";

  // 2. 기본 인풋 스타일
  // color-scheme: light 덕분에 다크모드에서도 흰 배경/검은 글씨가 유지됨
  const inputStyle = `
    w-full px-4 py-3.5 rounded-xl text-base transition-all outline-none
    bg-gray-50 border border-gray-200 
    text-gray-900 placeholder-gray-400
    focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 
  `;

  // 3. 읽기 전용 스타일 (인증 완료된 전화번호)
  // ★ 수정: bg-gray-200으로 더 진하게 해서 눈에 확 띄게 만듦
  const readOnlyStyle = `
    w-full px-4 py-3.5 rounded-xl text-base outline-none cursor-default font-medium
    bg-gray-200 border border-gray-300 text-gray-500
  `;

  return (
    // 전체 배경도 강제로 밝은 색 유지
    <div className="min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 md:p-10 rounded-3xl shadow-xl bg-white">
        <div className="text-center flex flex-col items-center">
          <img
            src="/images/mainlogo.jpg"
            alt="수원하나교회"
            className="h-14 w-auto mb-8 rounded-lg"
          />
        </div>

        {/* ================= 로그인 화면 ================= */}
        {view === "login" && (
          <form className="mt-4 space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              {errorMsg && (
                <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className={labelStyle}>이메일</label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  className={inputStyle}
                  // ★ 브라우저 다크모드 무시 설정
                  style={{ colorScheme: "light" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label className={labelStyle}>비밀번호</label>
                <input
                  type="password"
                  required
                  className={inputStyle}
                  style={{ colorScheme: "light" }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {loading ? "로그인 중..." : "로그인"}
              </button>
              <div className="text-center mt-2">
                <span className="text-sm text-gray-500">
                  계정이 없으신가요?
                </span>
                <button
                  type="button"
                  onClick={toggleView}
                  className="ml-2 text-sm font-bold text-blue-600 hover:underline"
                >
                  회원가입
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ================= 회원가입 화면 ================= */}
        {view === "signup" && (
          <div className="mt-4">
            {!isVerified ? (
              !isVerificationStarted ? (
                // 1. 대기 화면
                <div className="text-center space-y-8 animate-fadeIn py-4">
                  <div className="flex flex-col items-center gap-4">
                    {/* <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                      <svg
                        className="w-10 h-10 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.131A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.858.567-4.168"
                        />
                      </svg>
                    </div> */}
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        본인인증을 진행해주세요
                      </h2>
                      <p className="text-gray-500 leading-relaxed">
                        안전한 서비스 사용을 위해
                        <br />
                        휴대폰 번호 인증이 필요합니다.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsVerificationStarted(true)}
                      className="w-full py-4 bg-indigo-600 text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-indigo-700 transition-all transform hover:-translate-y-1"
                    >
                      휴대폰으로 인증하기
                    </button>
                    <button
                      type="button"
                      onClick={toggleView}
                      className="w-full py-3 text-gray-500 font-medium hover:text-gray-800 transition"
                    >
                      다음에 하기 (취소)
                    </button>
                  </div>
                </div>
              ) : (
                // 2. 인증 입력 화면
                <div className="animate-fadeIn space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      휴대폰 번호 입력 - 테스트 중(인증번호 123456)
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={inputStyle}
                        style={{ colorScheme: "light" }}
                        value={phone}
                        placeholder="010-1234-5678"
                        maxLength={13}
                        disabled={isCodeSent}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                      />
                      {!isCodeSent && (
                        <button
                          type="button"
                          onClick={handleSendCode}
                          disabled={loading || phone.length < 12}
                          className="px-5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 whitespace-nowrap shadow-md transition-colors"
                        >
                          인증요청
                        </button>
                      )}
                      {isCodeSent && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCodeSent(false);
                            setVerifyCode("");
                          }}
                          className="px-5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 whitespace-nowrap"
                        >
                          재입력
                        </button>
                      )}
                    </div>

                    {isCodeSent && (
                      <div className="animate-slideDown space-y-2">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            className={`${inputStyle} pr-24 tracking-widest font-bold text-lg`}
                            style={{ colorScheme: "light" }}
                            value={verifyCode}
                            placeholder="인증번호 6자리(123456)"
                            maxLength={6}
                            onChange={(e) =>
                              setVerifyCode(
                                e.target.value.replace(/[^0-9]/g, ""),
                              )
                            }
                          />
                          <div className="absolute right-4 top-4 flex items-center gap-3">
                            <span className="text-red-500 font-bold font-mono text-sm">
                              {formatTime(timeLeft)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleVerifyCode}
                          disabled={loading || verifyCode.length < 6}
                          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 shadow-md transition-colors mt-2"
                        >
                          인증번호 확인
                        </button>
                        <p className="text-xs text-gray-500 text-center pt-2">
                          문자가 안 오나요?{" "}
                          <span
                            className="underline cursor-pointer text-indigo-600 font-bold"
                            onClick={handleSendCode}
                          >
                            인증번호 재전송
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVerificationStarted(false)}
                    className="w-full py-3 text-gray-400 font-medium hover:text-gray-600 text-sm"
                  >
                    뒤로 가기
                  </button>
                </div>
              )
            ) : (
              /* --- CASE 3: 인증 완료 (가입 폼) --- */
              <form
                onSubmit={handleSignUp}
                className="animate-fadeIn space-y-5"
              >
                {errorMsg && (
                  <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium">
                    {errorMsg}
                  </div>
                )}

                <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
                  회원가입 정보 입력
                </h3>

                {/* 이름 */}
                <div>
                  <label className={labelStyle}>이름</label>
                  <input
                    type="text"
                    required
                    className={inputStyle}
                    style={{ colorScheme: "light" }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="실명 입력"
                  />
                </div>

                {/* 휴대폰 번호 (수정불가) - 회색 배경이 명확하게 보이도록 처리 */}
                <div>
                  <label className={labelStyle}>휴대폰 번호</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      className={`${readOnlyStyle} pr-12`}
                      style={{ colorScheme: "light" }} // ★ 다크모드 방지
                      value={phone}
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-7 h-7"
                      >
                        <path
                          fillRule="evenodd"
                          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 직분 (커스텀 Select) */}
                <div>
                  {/* Select 컴포넌트에 라벨 prop 전달 X, 직접 그림 */}
                  <label className={labelStyle}>직분</label>
                  <Select
                    value={position}
                    onChange={setPosition}
                    options={[
                      "사역자",
                      "셀리더",
                      "진장/코치",
                      "디렉터",
                      "일반",
                    ]}
                    className={inputStyle} // input과 동일한 스타일 적용
                  />
                </div>

                {/* 이메일 */}
                <div>
                  <label className={labelStyle}>이메일 (아이디)</label>
                  <input
                    type="email"
                    required
                    className={inputStyle}
                    style={{ colorScheme: "light" }}
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* 비밀번호 */}
                <div>
                  <label className={labelStyle}>비밀번호</label>
                  <input
                    type="password"
                    required
                    className={inputStyle}
                    style={{ colorScheme: "light" }}
                    placeholder="6자리 이상 입력"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="pt-4 space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition shadow-lg hover:shadow-xl"
                  >
                    {loading ? "가입 처리 중..." : "회원가입 완료"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleView}
                    className="w-full py-3 text-gray-400 font-medium hover:text-gray-600"
                  >
                    취소
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
