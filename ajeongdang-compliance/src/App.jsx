import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";
import Login from "./components/Login.jsx";
import ComplianceReviewManager from "./components/ComplianceReviewManager.jsx";

const ALLOWED_DOMAIN = "ajd.co.kr"; // 이 도메인 계정만 허용

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { role }
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [domainError, setDomainError] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 도메인 검증: ajd.co.kr 아니면 즉시 로그아웃
  function handleSession(s) {
    if (s?.user) {
      const email = s.user.email || "";
      if (!email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
        setDomainError(true);
        supabase.auth.signOut();
        setSession(null);
        return;
      }
    }
    setDomainError(false);
    setSession(s);
  }

  // 역할 조회
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data || { role: "viewer" });
        setProfileLoading(false);
      });
  }, [session]);

  if (!supabaseConfigured) return <ConfigError />;
  if (loading) return <Splash />;
  if (!session) return <Login domainError={domainError} />;
  if (profileLoading || !profile) return <Splash />;

  return (
    <ComplianceReviewManager
      userEmail={session.user?.email}
      userId={session.user?.id}
      role={profile.role}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
      불러오는 중…
    </div>
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
          환경변수(또는 로컬 <code className="rounded bg-slate-100 px-1">.env</code>)에 등록한 뒤
          다시 배포/실행하세요.
        </p>
      </div>
    </div>
  );
}
