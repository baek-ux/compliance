import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { X, ShieldCheck, PenSquare, Eye, Crown, RefreshCw } from "lucide-react";

/**
 * 역할 관리 (admin=alic 전용)
 * - 역할 3단계: viewer(열람) / editor(등록·수정) / admin(삭제·역할부여)
 * - 목록은 "한 번이라도 로그인한" 사용자만 나타남(구글 로그인 시 자동 생성)
 * - 승격/강등: profiles.role UPDATE (RLS: admin만)
 * - 관리자 인계: RPC transfer_admin (본인=editor, 대상=admin, 원자적)
 */
const ROLE_LABEL = { admin: "관리자", editor: "편집자", viewer: "뷰어" };

export default function AdminPanel({ currentUserId, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmTransfer, setConfirmTransfer] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    else setUsers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setRole = async (u, role) => {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", u.id);
    setBusy(false);
    if (error) setNotice({ type: "error", text: "역할 변경 실패: " + error.message });
    else { setNotice({ type: "ok", text: `${u.email} → ${ROLE_LABEL[role]}` }); load(); }
  };

  const transfer = async (u) => {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("transfer_admin", { target_id: u.id });
    setBusy(false);
    setConfirmTransfer(null);
    if (error) setNotice({ type: "error", text: "인계 실패: " + error.message });
    else { setNotice({ type: "ok", text: `${u.email} 에게 관리자를 인계했습니다. 본인은 편집자가 됩니다.` }); load(); }
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
            직원은 회사 구글 계정으로 <b>처음 로그인하면 자동으로 목록에 나타나며 기본 "뷰어"</b>입니다.
            등록·수정이 필요한 사람을 "편집자"로 올려주세요. 삭제 권한은 관리자만 가집니다.
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
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">아직 로그인한 사용자가 없습니다.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {users.map((u) => {
                const isMe = u.id === currentUserId;
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <RoleIcon role={u.role} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {u.email} {isMe && <span className="text-xs text-slate-400">(나)</span>}
                        </div>
                        <div className="text-xs text-slate-400">{ROLE_LABEL[u.role] || u.role}</div>
                      </div>
                    </div>
                    {!isMe && u.role !== "admin" && (
                      <div className="flex shrink-0 items-center gap-1">
                        {u.role === "viewer" ? (
                          <button onClick={() => setRole(u, "editor")} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                            <PenSquare size={12} /> 편집자 승격
                          </button>
                        ) : (
                          <button onClick={() => setRole(u, "viewer")} disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                            <Eye size={12} /> 뷰어로
                          </button>
                        )}
                        <button onClick={() => setConfirmTransfer(u)} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" title="관리자 인계(본인은 편집자가 됨)">
                          <Crown size={12} /> 인계
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            · 승격/강등은 즉시 적용됩니다. · 관리자 인계 시 본인은 편집자로 내려갑니다.
            · 계정 자체 차단이 필요하면 관리자(전산)에게 문의하세요(구글 로그인은 재로그인 시 뷰어로 재생성됩니다).
          </p>
        </div>
      </div>

      {confirmTransfer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">관리자를 인계할까요?</h4>
            <p className="mt-1 text-sm text-slate-500">
              {confirmTransfer.email} 이(가) 관리자가 되고, <b>본인은 편집자로 내려갑니다.</b> 되돌리려면 새 관리자가 다시 인계해야 합니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmTransfer(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={() => transfer(confirmTransfer)} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">인계</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleIcon({ role }) {
  if (role === "admin") return <ShieldCheck size={16} className="shrink-0 text-brand" />;
  if (role === "editor") return <PenSquare size={16} className="shrink-0 text-slate-500" />;
  return <Eye size={16} className="shrink-0 text-slate-400" />;
}
