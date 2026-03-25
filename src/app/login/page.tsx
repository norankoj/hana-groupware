"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";
import Select from "@/components/Select";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [view, setView] = useState<"login" | "signup" | "forgot">("login");

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

  // 🌟 비밀번호 찾기(재설정)용 상태
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetTargetEmail, setResetTargetEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // admin url로 타고 들어올 경우 관리자 권한 없다는 메시지 띄우기
  useEffect(() => {
    if (searchParams.get("error") === "unauthorized") {
      toast.error("관리자 권한이 필요한 페이지입니다.");
      window.history.replaceState(null, "", "/login");
    }
  }, [searchParams]);

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
    setNewPassword("");
    setConfirmPassword("");
    setResetTargetEmail("");
  };

  const changeView = (newView: "login" | "signup" | "forgot") => {
    setView(newView);
    resetForm();
  };

  // 문자 발송 (회원가입 & 비밀번호 찾기 공용)
  const handleSendCode = async () => {
    // 회원가입일 때는 이름 필수, 비번찾기일 때는 번호만 있으면 됨
    if (view === "signup" && !name.trim())
      return toast.error("이름을 입력해주세요.");
    if (!phone || phone.length < 10)
      return toast.error("휴대폰 번호를 정확히 입력해주세요.");

    const cleanPhone = phone.replace(/-/g, "");
    setLoading(true);

    try {
      if (view === "signup") {
        // 회원가입 시: 사전 등록 여부 및 중복 가입 체크
        const { data: allowedUser } = await supabase
          .from("allowed_users")
          .select("*")
          .eq("name", name.trim())
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (!allowedUser)
          throw new Error(
            "사전 등록된 분들만 회원가입이 가능합니다. 관리자에게 문의해주세요.",
          );
        if (allowedUser.is_registered)
          throw new Error(
            "이미 가입이 완료된 번호입니다. 로그인을 진행해주세요.",
          );
      } else if (view === "forgot") {
        // 비밀번호 찾기 시: 해당 번호로 가입된 계정이 있는지 체크
        const { data: foundEmail } = await supabase.rpc("get_email_by_phone", {
          search_phone: cleanPhone,
        });
        if (!foundEmail)
          throw new Error("입력하신 번호로 가입된 계정을 찾을 수 없습니다.");
        setResetTargetEmail(foundEmail); // 나중에 비번 바꿀 때 쓰기 위해 저장
      }

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

  // 로그인 로직
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    let targetEmail = email.trim();
    const cleanId = email?.replace(/-/g, "");
    const isPhone = /^[0-9]{10,11}$/.test(cleanId);

    if (isPhone) {
      const { data: foundEmail } = await supabase.rpc("get_email_by_phone", {
        search_phone: cleanId,
      });
      if (foundEmail) {
        targetEmail = foundEmail;
      } else {
        setErrorMsg("등록된 휴대폰 번호를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });
    if (error) {
      setErrorMsg("로그인 실패: 아이디(번호) 또는 비밀번호를 확인해주세요.");
    } else {
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

  // 비밀번호 재설정 (Admin API 활용 또는 우회)
  // 로그인 전이므로 본인 인증이 완료되었다면 RPC 함수를 통해 안전하게 변경
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerified) return toast.error("휴대폰 인증을 완료해주세요.");
    if (newPassword.length < 6)
      return toast.error("비밀번호는 6자리 이상이어야 합니다.");
    if (newPassword !== confirmPassword)
      return toast.error("비밀번호가 일치하지 않습니다.");

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetTargetEmail, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "비밀번호 변경 실패");

      toast.success("비밀번호가 변경되었습니다! 다시 로그인해주세요.");
      changeView("login");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
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

  const labelStyle = "block text-sm font-bold text-gray-600 mb-1.5 ml-1";
  const inputStyle = `w-full px-4 py-3.5 rounded-xl text-base transition-all outline-none bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200`;
  const readOnlyStyle = `w-full px-4 py-3.5 rounded-xl text-base outline-none cursor-default font-medium bg-gray-200 border border-gray-300 text-gray-500`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 md:p-10 rounded-3xl shadow-xl bg-white relative overflow-hidden">
        <div className="text-center flex flex-col items-center relative z-10">
          <Image
            src="/images/mainlogo.jpg"
            alt="수원하나교회"
            width={200}
            height={56}
            className="mb-8 rounded-lg"
            style={{ width: "auto", height: "56px" }}
            priority
          />
        </div>

        {/* ================= 로그인 화면 ================= */}
        {view === "login" && (
          <form
            className="mt-4 space-y-6 relative z-10 animate-fadeIn"
            onSubmit={handleLogin}
          >
            <div className="space-y-4">
              {errorMsg && (
                <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl font-medium">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className={labelStyle}>이메일 또는 휴대폰 번호</label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  className={inputStyle}
                  style={{ colorScheme: "light" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

              {/* 회원가입 & 비밀번호 찾기 링크 영역 */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-4 text-[13px] sm:text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 whitespace-nowrap">
                    계정이 없으신가요?
                  </span>
                  <button
                    type="button"
                    onClick={() => changeView("signup")}
                    className="font-bold text-blue-600 hover:underline whitespace-nowrap"
                  >
                    회원가입
                  </button>
                </div>

                {/* 모바일에서는 세로 선을 숨김 (hidden sm:block) */}
                <div className="hidden sm:block w-px h-3 bg-gray-300"></div>

                <button
                  type="button"
                  onClick={() => changeView("forgot")}
                  className="font-bold text-gray-500 hover:text-gray-900 transition-colors whitespace-nowrap"
                >
                  비밀번호 찾기
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ================= 비밀번호 찾기 화면 ================= */}
        {view === "forgot" && (
          <div className="mt-4 relative z-10 animate-fadeIn">
            {!isVerified ? (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    비밀번호 찾기
                  </h2>
                  <p className="text-gray-500 text-sm">
                    가입 시 등록한 휴대폰 번호로
                    <br />
                    인증을 진행해주세요.
                  </p>
                </div>

                <div>
                  <label className={labelStyle}>휴대폰 번호</label>
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
                    {!isCodeSent ? (
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={loading || phone.length < 12}
                        className="px-5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 whitespace-nowrap shadow-md transition-colors"
                      >
                        인증요청
                      </button>
                    ) : (
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
                        placeholder="인증번호 6자리"
                        maxLength={6}
                        onChange={(e) =>
                          setVerifyCode(e.target.value.replace(/[^0-9]/g, ""))
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
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => changeView("login")}
                  className="w-full py-3 text-gray-400 font-medium hover:text-gray-600 text-sm"
                >
                  로그인으로 돌아가기
                </button>
              </div>
            ) : (
              /* 🌟 CASE 3: 인증 완료 -> 임시 비밀번호 발급 화면 */
              <div className="space-y-6 animate-fadeIn text-center py-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                  ✓
                </div>
                <h3 className="text-2xl font-bold text-gray-900">
                  본인인증 완료
                </h3>

                {!tempPassword ? (
                  <>
                    <p className="text-gray-500 text-sm mb-6">
                      본인 확인이 완료되었습니다.
                      <br />
                      아래 버튼을 눌러 임시 비밀번호를 발급받으세요.
                    </p>
                    <button
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const res = await fetch(
                            "/api/auth/issue-temp-password",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: resetTargetEmail }),
                            },
                          );
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          setTempPassword(data.tempPassword);
                          toast.success("임시 비밀번호가 발급되었습니다!");
                        } catch (err: any) {
                          toast.error(err.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="w-full py-4 bg-indigo-600 text-white text-lg font-bold rounded-2xl hover:bg-indigo-700 transition shadow-lg"
                    >
                      {loading ? "발급 중..." : "임시 비밀번호 발급받기"}
                    </button>
                  </>
                ) : (
                  <div className="animate-slideDown space-y-6">
                    <p className="text-gray-500 text-sm">
                      발급된 임시 비밀번호입니다.
                      <br />
                      로그인 후 마이페이지에서 반드시 비밀번호를 변경해주세요.
                    </p>
                    <div className="bg-gray-100 p-6 rounded-2xl border border-gray-200">
                      <span className="block text-3xl font-mono font-extrabold text-indigo-600 tracking-widest">
                        {tempPassword}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tempPassword);
                        toast.success("비밀번호가 복사되었습니다!");
                        changeView("login");
                      }}
                      className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl hover:bg-blue-700 transition shadow-lg flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      복사하고 로그인하러 가기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= 회원가입 화면 ================= */}
        {view === "signup" && (
          // ... (기존 회원가입 코드와 완전히 동일하므로 생략 없이 아래에 유지합니다)
          <div className="mt-4 relative z-10">
            {!isVerified ? (
              !isVerificationStarted ? (
                <div className="text-center space-y-8 animate-fadeIn py-4">
                  <div className="flex flex-col items-center gap-4">
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
                      onClick={() => changeView("login")}
                      className="w-full py-3 text-gray-500 font-medium hover:text-gray-800 transition"
                    >
                      로그인으로 돌아가기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="animate-fadeIn space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className={labelStyle}>이름</label>
                      <input
                        type="text"
                        className={inputStyle}
                        style={{ colorScheme: "light" }}
                        value={name}
                        disabled={isCodeSent}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="실명 입력"
                      />
                    </div>
                    <div>
                      <label className={labelStyle}>휴대폰 번호</label>
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
                          onChange={(e) =>
                            setPhone(formatPhone(e.target.value))
                          }
                        />
                        {!isCodeSent ? (
                          <button
                            type="button"
                            onClick={handleSendCode}
                            disabled={loading || phone.length < 12}
                            className="px-5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 whitespace-nowrap shadow-md transition-colors"
                          >
                            인증요청
                          </button>
                        ) : (
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
                            placeholder="인증번호 6자리"
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
                <div>
                  <label className={labelStyle}>휴대폰 번호</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      className={`${readOnlyStyle} pr-12`}
                      style={{ colorScheme: "light" }}
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
                <div>
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
                    className={inputStyle}
                  />
                </div>
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
                    onClick={() => changeView("login")}
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
