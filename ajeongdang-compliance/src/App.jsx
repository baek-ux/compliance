import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";
import {
  naverworksConfigured,
  consumeRedirect,
  saveSession,
  loadSession,
  clearSession,
} from "./lib/naverworks.js";
import Login from "./components/Login.jsx";
import ComplianceReviewManager from "./components/ComplianceReviewManager.jsx";

const ALLOWED_DOMAIN = "ajd.co.kr";
const ADMIN_EMAIL = "alic@ajd.co.kr"; // 최고관리자(하드코딩)

export default function App() {
  const [session, setSession] = useState(null); // { email, name, exp }
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [domainError, setDomainError] = useState(false);

  // 최초 로드: 리다이렉트 해시 처리 → 없으면 저장된 세션 복구
  useEffect(() => {
    const r = consumeRedirect();
    if (r && r.error) {
      setLoginError(r.error);
      setLoading(false);
      return;
    }
    if (r && r.email) {
      finishLogin(r);
      setLoading(false);
      return;
    }
    const saved = loadSession();
    if (saved) setSession(saved);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishLogin(sess) {
    // 도메인 검증
    if (!sess.email.endsWith("@" + ALLOWED_DOMAIN)) {
      setDomainError(true);
      clearSession();
      setSession(null);
      return;
    }
    setDomainError(false);
    saveSession(sess);
    setSession(sess);
  }

  // 역할 조회: app_roles 테이블에서 email 로. alic 은 무조건 admin.
  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    if (session.email === ADMIN_EMAIL) {
      setRole("admin");
      return;
    }
    if (!supabaseConfigured) {
      setRole("viewer");
      return;
    }
    setRoleLoading(true);
    supabase
      .from("app_roles")
      .select("role")
      .eq("email", session.email)
      .maybeSingle()
      .then(({ data }) => {
        setRole(data?.role || "viewer");
        setRoleLoading(false);
      });
  }, [session]);

  const signOut = () => {
    clearSession();
    setSession(null);
    setRole(null);
  };

  if (!naverworksConfigured || !supabaseConfigured) return <ConfigError nw={!naverworksConfigured} sb={!supabaseConfigured} />;
  if (loading) return <Splash />;
  if (!session) return <Login domainError={domainError} loginError={loginError} />;
  if (roleLoading || !role) return <Splash />;

  return (
    <ComplianceReviewManager
      userEmail={session.email}
      role={role}
      adminEmail={ADMIN_EMAIL}
      onSignOut={signOut}
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

function ConfigError({ nw, sb }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl bg-white p-6 ring-1 ring-red-200">
        <h1 className="text-lg font-bold text-red-700">환경변수가 설정되지 않았습니다</h1>
        <p className="mt-2 text-sm text-slate-600">
          다음 환경변수를 Vercel(또는 로컬 <code className="rounded bg-slate-100 px-1">.env</code>)에 등록한 뒤 다시 배포/실행하세요.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {nw && <li><code className="rounded bg-slate-100 px-1">VITE_NAVERWORKS_CLIENT_ID</code></li>}
          {sb && <li><code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code>, <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code></li>}
        </ul>
      </div>
    </div>
  );
}
