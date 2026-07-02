import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { ShieldCheck, Lock } from "lucide-react";

export default function ResetPassword({ onDone, forced }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    if (pw.length < 8) {
      setMsg({ type: "error", text: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (pw !== pw2) {
      setMsg({ type: "error", text: "두 비밀번호가 일치하지 않습니다." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data: updated, error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      setMsg({ type: "error", text: "설정에 실패했습니다. 링크가 만료되었을 수 있어요. 다시 요청하세요." });
      return;
    }
    // 비번 설정 완료 표시(must_set_password=false) — 본인 것만 내리는 전용 RPC
    try {
      await supabase.rpc("mark_password_set");
    } catch (_) { /* 무시: 다음 로그인 때 재시도됨 */ }

    setMsg({ type: "ok", text: "비밀번호가 설정되었습니다. 다시 로그인해 주세요." });
    // URL 토큰 정리 후 로그아웃 → 로그인 화면으로
    window.history.replaceState(null, "", window.location.origin);
    setTimeout(async () => {
      await supabase.auth.signOut();
      onDone();
    }, 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/ajd-logo.webp" alt="아정당" className="mb-3 h-10 w-auto" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {forced ? "비밀번호 설정" : "새 비밀번호 설정"}
          </h1>
          {forced && (
            <p className="mt-1 text-xs text-slate-500">
              첫 로그인입니다. 사용할 비밀번호를 설정하면 다시 로그인 화면으로 이동합니다.
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <label className="mb-1 block text-xs font-medium text-slate-500">새 비밀번호 (8자 이상)</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>

          <label className="mb-1 mt-4 block text-xs font-medium text-slate-500">새 비밀번호 확인</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>

          {msg && (
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-xs ring-1 ${
                msg.type === "error"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "변경 중…" : "비밀번호 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}
