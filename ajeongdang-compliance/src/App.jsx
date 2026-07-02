import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";
import Login from "./components/Login.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import ComplianceReviewManager from "./components/ComplianceReviewManager.jsx";

// 초대/재설정 링크의 type 을 해시(#)와 쿼리(?) 양쪽에서 최대한 이르게 캡처.
// (Supabase가 URL을 소비/정리하기 전에 읽어둠) — 1차 안전장치.
const initialLinkType = (() => {
  try {
    const h = new URLSearchParams(window.location.hash.slice(1)).get("type");
    const q = new URLSearchParams(window.location.search).get("type");
    return h || q;
  } catch {
    return null;
  }
})();

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { role, must_set_password }
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(
    initialLinkType === "recovery" || initialLinkType === "invite"
  );

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

  // 로그인 사용자의 역할 + 비번설정 필요 여부 조회
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("role, must_set_password")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data || { role: "staff", must_set_password: false });
        setProfileLoading(false);
      });
  }, [session]);

  if (!supabaseConfigured) return <ConfigError />;

  if (loading)
    return <Splash />;

  // 링크(초대/재설정)로 진입 → 비번 설정 우선
  if (recovery) return <ResetPassword onDone={() => setRecovery(false)} />;

  if (!session) return <Login />;

  // 세션은 있는데 프로필 로딩 중 → 잠깐 대기 (매니저를 깜빡 보여주지 않도록)
  if (profileLoading || !profile) return <Splash />;

  // 2차 안전장치: 초대로 만들어진 계정은 비번을 아직 안 정함 → 강제 설정
  if (profile.must_set_password)
    return <ResetPassword forced onDone={() => setRecovery(false)} />;

  return (
    <ComplianceReviewManager
      userEmail={session.user?.email}
      userId={session.user?.id}
      isAdmin={profile?.role === "admin"}
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
          다시 배포/실행하세요. 자세한 절차는 README를 참고하세요.
        </p>
      </div>
    </div>
  );
}
