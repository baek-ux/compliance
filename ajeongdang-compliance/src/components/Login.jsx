import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { ShieldCheck, Mail, Lock, ArrowLeft } from "lucide-react";

export default function Login() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'forgot'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'error'|'ok', text}

  const signIn = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg({ type: "error", text: "이메일 또는 비밀번호가 올바르지 않습니다." });
    // 성공 시 onAuthStateChange가 화면을 전환하므로 별도 처리 불필요
  };

  const sendReset = async () => {
    if (!email) {
      setMsg({ type: "error", text: "이메일을 입력하세요." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setMsg({ type: "error", text: "메일 발송에 실패했습니다. 잠시 후 다시 시도하세요." });
    else
      setMsg({
        type: "ok",
        text: "재설정 메일을 보냈습니다. 메일의 링크로 새 비밀번호를 설정하세요. (계정이 있는 경우에만 발송됩니다)",
      });
  };

  const onKey = (e) => {
    if (e.key === "Enter") (mode === "signin" ? signIn : sendReset)();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/ajd-logo.webp" alt="아정당" className="mb-3 h-10 w-auto" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
            아정당 · 준법감시팀
          </p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">준법심의번호 관리</h1>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {mode === "signin" ? (
            <>
              <label className="mb-1 block text-xs font-medium text-slate-500">회사 이메일</label>
              <InputIcon icon={Mail}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="name@ajeongdang.co.kr"
                  className={field}
                  autoComplete="username"
                />
              </InputIcon>

              <label className="mb-1 mt-4 block text-xs font-medium text-slate-500">비밀번호</label>
              <InputIcon icon={Lock}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="••••••••"
                  className={field}
                  autoComplete="current-password"
                />
              </InputIcon>

              {msg && <Notice msg={msg} />}

              <button
                onClick={signIn}
                disabled={busy}
                className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? "확인 중…" : "들어가기"}
              </button>

              <button
                onClick={() => {
                  setMode("forgot");
                  setMsg(null);
                }}
                className="mt-3 w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                비밀번호를 잊으셨나요?
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setMode("signin");
                  setMsg(null);
                }}
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft size={13} /> 로그인으로
              </button>
              <h2 className="text-sm font-semibold text-slate-800">비밀번호 재설정</h2>
              <p className="mt-1 text-xs text-slate-500">
                가입된 회사 이메일을 입력하면 재설정 링크를 보내드립니다.
              </p>
              <label className="mb-1 mt-4 block text-xs font-medium text-slate-500">회사 이메일</label>
              <InputIcon icon={Mail}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="name@ajeongdang.co.kr"
                  className={field}
                />
              </InputIcon>

              {msg && <Notice msg={msg} />}

              <button
                onClick={sendReset}
                disabled={busy}
                className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? "발송 중…" : "재설정 메일 보내기"}
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          계정은 관리자가 발급합니다. 접근 권한이 필요하면 준법감시팀 관리자에게 요청하세요.
        </p>
      </div>
    </div>
  );
}

const field =
  "w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white";

function InputIcon({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      {children}
    </div>
  );
}

function Notice({ msg }) {
  const cls =
    msg.type === "error"
      ? "bg-red-50 text-red-700 ring-red-200"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <div className={`mt-4 rounded-lg px-3 py-2 text-xs ring-1 ${cls}`}>{msg.text}</div>;
}
