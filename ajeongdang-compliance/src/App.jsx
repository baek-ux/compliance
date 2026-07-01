import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";
import Login from "./components/Login.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import ComplianceReviewManager from "./components/ComplianceReviewManager.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false); // 비번 재설정 진입 여부

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <ConfigError />;

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        불러오는 중…
      </div>
    );

  // 비번 재설정 링크로 들어온 경우: 세션이 있어도 재설정 화면 우선
  if (recovery)
    return (
      <ResetPassword
        onDone={() => {
          setRecovery(false);
        }}
      />
    );

  if (!session) return <Login />;

  return (
    <ComplianceReviewManager
      userEmail={session.user?.email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

function ConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl bg-white p-6 ring-1 ring-red-200">
        <h1 className="text-lg font-bold text-red-700">환경변수가 설정되지 않았습니다</h1>
        <p className="mt-2 text-sm text-slate-600">
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> 를 Vercel
          프로젝트 환경변수(또는 로컬 <code className="rounded bg-slate-100 px-1">.env</code>)에
          등록한 뒤 다시 배포/실행하세요. 자세한 절차는 README를 참고하세요.
        </p>
      </div>
    </div>
  );
}
