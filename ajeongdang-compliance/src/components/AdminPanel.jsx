import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { X, ShieldCheck, PenSquare, Eye, Trash2, Plus, RefreshCw } from "lucide-react";

/**
 * 역할 관리 (admin 전용) — email 기반 app_roles 테이블
 * 역할: viewer(열람) / editor(등록·수정) / admin(삭제·역할부여)
 * - 네이버웍스 직접 로그인이라 사용자 id(uuid) 없음 → email 로 관리
 * - 로그인 안 한 사람도 미리 email 로 등록 가능(선등록)
 * - alic(adminEmail)은 코드상 항상 admin (목록에 없어도 관리자)
 */
const ROLE_LABEL = { admin: "관리자", editor: "편집자", viewer: "뷰어" };
const DOMAIN = "ajd.co.kr";

export default function AdminPanel({ currentEmail, adminEmail, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("editor");

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("app_roles")
      .select("email, role, created_at")
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setRole = async (email, role) => {
    setBusy(true); setNotice(null);
    const { error } = await supabase.from("app_roles").update({ role }).eq("email", email);
    setBusy(false);
    if (error) setNotice({ type: "error", text: "변경 실패: " + error.message });
    else { setNotice({ type: "ok", text: `${email} → ${ROLE_LABEL[role]}` }); load(); }
  };

  const removeRow = async (email) => {
    setBusy(true); setNotice(null);
    const { error } = await supabase.from("app_roles").delete().eq("email", email);
    setBusy(false);
    if (error) setNotice({ type: "error", text: "삭제 실패: " + error.message });
    else { setNotice({ type: "ok", text: `${email} 권한 제거(뷰어로 강등)` }); load(); }
  };

  const addRow = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.endsWith("@" + DOMAIN)) {
      setNotice({ type: "error", text: `${DOMAIN} 이메일만 등록할 수 있습니다.` });
      return;
    }
    setBusy(true); setNotice(null);
    // upsert: 이미 있으면 역할만 갱신
    const { error } = await supabase.from("app_roles").upsert({ email, role: newRole }, { onConflict: "email" });
    setBusy(false);
    if (error) setNotice({ type: "error", text: "등록 실패: " + error.message });
    else { setNotice({ type: "ok", text: `${email} → ${ROLE_LABEL[newRole]} 등록` }); setNewEmail(""); load(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">역할 관리</h3>
          <div className="flex items-center gap-1">
            <button onClick={load} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="새로고침"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
            등록·수정이 필요한 사람의 회사 이메일을 <b>편집자</b>로 추가하세요. 목록에 없는 직원은 로그인 시 자동으로 <b>뷰어(열람)</b>입니다.
            로그인 전에도 미리 등록해 둘 수 있습니다. 최고관리자(<b>{adminEmail}</b>)는 항상 관리자입니다.
          </div>

          {/* 선등록 */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
            <input
              type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="이름@ajd.co.kr"
              className="min-w-[180px] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="editor">편집자</option>
              <option value="viewer">뷰어</option>
              <option value="admin">관리자</option>
            </select>
            <button onClick={addRow} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              <Plus size={14} /> 추가
            </button>
          </div>

          {notice && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-xs ring-1 ${
              notice.type === "error" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}>{notice.text}</div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : err ? (
            <div className="py-8 text-center text-sm text-red-500">{err}</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">등록된 편집자/관리자가 없습니다. 위에서 추가하세요.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rows.map((u) => {
                const isMe = u.email === currentEmail;
                const isRootAdmin = u.email === adminEmail;
                return (
                  <div key={u.email} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <RoleIcon role={u.role} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {u.email} {isMe && <span className="text-xs text-slate-400">(나)</span>}
                        </div>
                        <div className="text-xs text-slate-400">{ROLE_LABEL[u.role] || u.role}</div>
                      </div>
                    </div>
                    {!isRootAdmin && (
                      <div className="flex shrink-0 items-center gap-1">
                        {u.role === "viewer" ? (
                          <button onClick={() => setRole(u.email, "editor")} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                            <PenSquare size={12} /> 편집자
                          </button>
                        ) : (
                          <button onClick={() => setRole(u.email, "viewer")} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            <Eye size={12} /> 뷰어로
                          </button>
                        )}
                        <button onClick={() => removeRow(u.email)} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50" title="목록에서 제거(뷰어로)">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                    {isRootAdmin && <span className="shrink-0 text-xs text-brand">최고관리자</span>}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            · 목록에서 제거하면 그 사람은 다음 로그인부터 뷰어(열람만)로 돌아갑니다.
            · 최고관리자(<b>{adminEmail}</b>)는 코드에 고정되어 목록에서 바꿀 수 없습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function RoleIcon({ role }) {
  if (role === "admin") return <ShieldCheck size={16} className="shrink-0 text-brand" />;
  if (role === "editor") return <PenSquare size={16} className="shrink-0 text-slate-500" />;
  return <Eye size={16} className="shrink-0 text-slate-400" />;
}
