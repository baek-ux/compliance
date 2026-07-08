import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Login({ domainError }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const signIn = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "custom:naverworks",
      options: {
        redirectTo: window.location.origin,
        scopes: "openid email profile",
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "이동 중…" : "네이버웍스로 로그인"}
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            ajd.co.kr 네이버웍스 계정으로 로그인하세요. 접근 권한 문의는 준법감시팀 관리자에게.
          </p>
        </div>
      </div>
    </div>
  );
}

