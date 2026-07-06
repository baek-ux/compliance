import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Login({ domainError }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const signIn = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // 회사 워크스페이스 계정 선택을 유도 (hd 힌트)
        queryParams: { hd: "ajd.co.kr", prompt: "select_account" },
      },
    });
    if (error) {
      setBusy(false);
      setErr("로그인을 시작할 수 없습니다. 잠시 후 다시 시도하세요.");
    }
    // 성공 시 구글로 리다이렉트되므로 이후 처리는 App 에서
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
          {domainError && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
              아정당(ajd.co.kr) 회사 계정으로만 로그인할 수 있습니다. 개인 계정으로는 접근이 제한됩니다.
            </div>
          )}
          {err && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
              {err}
            </div>
          )}

          <button
            onClick={signIn}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <GoogleIcon />
            {busy ? "이동 중…" : "Google 회사 계정으로 로그인"}
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            ajd.co.kr 워크스페이스 계정으로 로그인하세요. 접근 권한 문의는 준법감시팀 관리자에게.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
