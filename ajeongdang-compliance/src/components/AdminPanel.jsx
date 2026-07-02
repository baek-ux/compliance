import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { X, UserPlus, ShieldCheck, User, Trash2, Crown, RefreshCw } from "lucide-react";

/**
 * 직원/관리자 관리 (admin 전용)
 * - 목록: profiles 테이블에서 조회 (RLS: admin만 전체 조회 가능)
 * - 초대: Edge Function 'invite-user' (service_role 필요)
 * - 삭제: Edge Function 'delete-user' (service_role 필요)
 * - 역할변경: profiles.role UPDATE (RLS: admin만)
 * - 관리자 인계: RPC 'transfer_admin' (본인=staff, 대상=admin 원자적 처리)
 */
export default function AdminPanel({ currentUserId, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [notice, setNotice] = useState(null); // {type, text}
  const [confirm, setConfirm] = useState(null); // {kind:'delete'|'transfer', user}

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

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { email, role: inviteRole, redirectTo: window.location.origin },
    });
    setBusy(false);
    if (error || data?.error) {
      setNotice({ type: "error", text: "초대 실패: " + (data?.error || error.message) });
    } else {
      setNotice({ type: "ok", text: `${email} 초대 메일을 발송했습니다.` });
      setInviteEmail("");
      setInviteRole("staff");
      load();
    }
  };

  const changeRole = async (u, role) => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", u.id);
    setBusy(false);
    if (error) setNotice({ type: "error", text: "역할 변경 실패: " + error.message });
    else load();
  };

  const doTransfer = async (u) => {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("transfer_admin", { target_id: u.id });
    setBusy(false);
    setConfirm(null);
    if (error) setNotice({ type: "error", text: "인계 실패: " + error.message });
    else {
      setNotice({ type: "ok", text: `${u.email} 에게 관리자를 인계했습니다. 본인은 직원 권한이 됩니다.` });
      load();
    }
  };

  const doDelete = async (u) => {
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: u.id },
    });
    setBusy(false);
    setConfirm(null);
    if (error || data?.error) setNotice({ type: "error", text: "삭제 실패: " + (data?.error || error.message) });
    else { setNotice({ type: "ok", text: `${u.email} 계정을 삭제했습니다.` }); load(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            직원 / 관리자 관리
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={load} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="새로고침"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5">
          {/* 초대 */}
          <div className="mb-5 rounded-xl border border-slate-200 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-800">직원 초대</div>
            <p className="mb-3 text-xs text-slate-500">
              회사 이메일로 초대 메일을 보냅니다. 초대받은 사람이 링크에서 <b>본인 비밀번호를 직접 설정</b>합니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@ajd.co.kr"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-400">
                <option value="staff">직원</option>
                <option value="admin">관리자</option>
              </select>
              <button onClick={invite} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                <UserPlus size={15} /> 초대
              </button>
            </div>
          </div>

          {notice && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-xs ring-1 ${
              notice.type === "error" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}>{notice.text}</div>
          )}

          {/* 목록 */}
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : err ? (
            <div className="py-8 text-center text-sm text-red-500">{err}</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {users.map((u) => {
                const isMe = u.id === currentUserId;
                const admin = u.role === "admin";
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {admin ? <ShieldCheck size={16} className="shrink-0 text-brand" /> : <User size={16} className="shrink-0 text-slate-400" />}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {u.email} {isMe && <span className="text-xs text-slate-400">(나)</span>}
                        </div>
                        <div className="text-xs text-slate-400">{admin ? "관리자" : "직원"}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* 역할 토글 (본인 제외) */}
                      {!isMe && (
                        admin ? (
                          <button onClick={() => changeRole(u, "staff")} disabled={busy}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">직원으로</button>
                        ) : (
                          <button onClick={() => changeRole(u, "admin")} disabled={busy}
                            className="rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">관리자 승격</button>
                        )
                      )}
                      {/* 관리자 인계 (대상이 직원일 때만 의미) */}
                      {!isMe && !admin && (
                        <button onClick={() => setConfirm({ kind: "transfer", user: u })} disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" title="관리자 인계(본인은 직원이 됨)">
                          <Crown size={12} /> 인계
                        </button>
                      )}
                      {/* 삭제 (본인 제외) */}
                      {!isMe && (
                        <button onClick={() => setConfirm({ kind: "delete", user: u })} disabled={busy}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="계정 삭제"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            · 삭제/초대는 관리자만 가능합니다. · 관리자 인계 시 본인은 직원 권한으로 내려갑니다. · 역할 변경은 즉시 적용됩니다.
          </p>
        </div>
      </div>

      {/* 확인 다이얼로그 */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            {confirm.kind === "delete" ? (
              <>
                <h4 className="text-base font-semibold text-slate-900">계정을 삭제할까요?</h4>
                <p className="mt-1 text-sm text-slate-500">{confirm.user.email} 의 로그인 계정이 영구 삭제됩니다.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setConfirm(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">취소</button>
                  <button onClick={() => doDelete(confirm.user)} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">삭제</button>
                </div>
              </>
            ) : (
              <>
                <h4 className="text-base font-semibold text-slate-900">관리자를 인계할까요?</h4>
                <p className="mt-1 text-sm text-slate-500">{confirm.user.email} 이(가) 관리자가 되고, <b>본인은 직원 권한으로 내려갑니다.</b> 되돌리려면 새 관리자가 다시 승격해줘야 합니다.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setConfirm(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">취소</button>
                  <button onClick={() => doTransfer(confirm.user)} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">인계</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
