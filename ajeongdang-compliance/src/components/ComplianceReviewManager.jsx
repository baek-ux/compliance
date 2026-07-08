import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import AdminPanel from "./AdminPanel.jsx";
import {
  Search, Plus, Pencil, Trash2, X, ShieldCheck, AlertTriangle,
  Clock, Filter, Wand2, Link2, ChevronDown, LogOut, RefreshCw, Users,
} from "lucide-react";

/**
 * 준법심의번호 통합 관리 — Supabase 연동판
 * 테이블: review_number (컬럼은 아래 필드명과 1:1, snake_case)
 * RLS: authenticated 만 read/write (supabase/schema.sql 참고)
 */

const ORG_PREFIX = "아정당 준법심의필"; // ← 주체명 변경 시 여기만 수정

const CATEGORIES = ["사내준법", "생보협회", "손보협회"];
const MEDIA_TYPES = ["블로그", "영상", "홈페이지", "랜딩페이지", "알림톡", "DM", "SMS", "전단", "스크립트", "기타"];
const RESULTS = ["심사중", "승인", "조건부승인", "부적합", "재심"];

// 구분 배지: 시인성 위주 솔리드. 상태색(초록/주황/빨강)과 겹치지 않게 회색·파랑·보라 사용.
const CAT_STYLE = {
  사내준법: "bg-slate-800 text-white",
  생보협회: "bg-sky-600 text-white",
  손보협회: "bg-violet-600 text-white",
};
const EXPIRY_SOON_DAYS = 30;

const iso = (d) => d.toISOString().slice(0, 10);
const DATE_FIELDS = ["applied_date", "reviewed_date", "valid_from", "valid_to"];

function nextInternalNo(rows) {
  const year = new Date().getFullYear();
  const re = new RegExp(`제${year}-(\\d+)호`);
  let max = 0;
  rows.forEach((r) => {
    if (r.category === "사내준법" && r.review_no) {
      const m = r.review_no.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  });
  return `${ORG_PREFIX} 제${year}-${String(max + 1).padStart(4, "0")}호`;
}

function daysLeft(validTo) {
  if (!validTo) return null;
  const t = new Date(iso(new Date()));
  return Math.round((new Date(validTo) - t) / 86400000);
}
function deriveStatus(row) {
  if (row.result === "심사중") return { key: "review", label: "심사중" };
  if (row.result === "부적합") return { key: "rejected", label: "부적합" };
  if (row.result === "재심") return { key: "recheck", label: "재심" };
  const d = daysLeft(row.valid_to);
  if (d === null) return { key: "valid", label: "유효(기한없음)" };
  if (d < 0) return { key: "expired", label: "만료됨" };
  if (d <= EXPIRY_SOON_DAYS) return { key: "soon", label: `만료임박 D-${d}` };
  return { key: "valid", label: `유효 D-${d}` };
}
const STATUS_STYLE = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  soon: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  review: "bg-slate-100 text-slate-600 border-slate-200",
  recheck: "bg-orange-50 text-orange-700 border-orange-200",
  rejected: "bg-slate-100 text-slate-400 border-slate-200 line-through",
};
const ROW_ACCENT = {
  valid: "border-l-emerald-400", soon: "border-l-amber-400",
  expired: "border-l-red-400", review: "border-l-slate-300",
  recheck: "border-l-orange-400", rejected: "border-l-slate-200",
};

const emptyRow = () => ({
  id: null, category: "사내준법", review_no: "", title: "", media_type: "블로그",
  product: "", applied_date: iso(new Date()), reviewed_date: "", result: "심사중",
  valid_from: "", valid_to: "", applicant: "", approver: "", usages: [], note: "",
});

// 빈 날짜 문자열 → null (date 컬럼 대응), 화면용 필드 제거
function toDbRow(row) {
  const { id, ...rest } = row;
  const out = { ...rest };
  DATE_FIELDS.forEach((f) => { if (!out[f]) out[f] = null; });
  if (!Array.isArray(out.usages)) out.usages = [];
  return out;
}
// DB → 화면 (null 날짜 → 빈 문자열, usages 보정)
function fromDbRow(row) {
  const out = { ...row };
  DATE_FIELDS.forEach((f) => { if (out[f] == null) out[f] = ""; });
  if (!Array.isArray(out.usages)) out.usages = out.usages ? out.usages : [];
  return out;
}

export default function ComplianceReviewManager({ userEmail, role, adminEmail, onSignOut }) {
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "editor";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("전체");
  const [fMedia, setFMedia] = useState("전체");
  const [fStatus, setFStatus] = useState("전체");
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("review_number")
      .select("*")
      .order("id", { ascending: false });
    if (error) setLoadError(error.message);
    else setRows((data || []).map(fromDbRow));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const upsert = async (row) => {
    setSaving(true);
    if (row.id == null) {
      const { error } = await supabase.from("review_number").insert(toDbRow(row));
      if (error) alert("저장 실패: " + error.message);
    } else {
      const { error } = await supabase.from("review_number").update(toDbRow(row)).eq("id", row.id);
      if (error) alert("수정 실패: " + error.message);
    }
    setSaving(false);
    setEditing(null);
    await load();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("review_number").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    setConfirmId(null);
    await load();
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fCat !== "전체" && r.category !== fCat) return false;
      if (fMedia !== "전체" && r.media_type !== fMedia) return false;
      if (fStatus !== "전체" && deriveStatus(r).key !== fStatus) return false;
      if (term) {
        const urls = (r.usages || []).map((u) => u.url).join(" ");
        const hay = `${r.review_no} ${r.title} ${r.product} ${r.applicant} ${urls} ${r.note}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, fCat, fMedia, fStatus]);

  const stats = useMemo(() => {
    let valid = 0, soon = 0, expired = 0;
    rows.forEach((r) => {
      const s = deriveStatus(r).key;
      if (s === "valid") valid++;
      if (s === "soon") soon++;
      if (s === "expired") expired++;
    });
    return { total: rows.length, valid, soon, expired };
  }, [rows]);

  function resetFilters() { setFCat("전체"); setFMedia("전체"); setFStatus("전체"); setQ(""); }

  const tiles = [
    { label: "전체", value: stats.total, tone: "text-slate-800", onClick: resetFilters },
    { label: "유효", value: stats.valid, tone: "text-emerald-600", onClick: () => setFStatus("valid") },
    { label: "만료임박", value: stats.soon, tone: "text-amber-600", onClick: () => setFStatus("soon") },
    { label: "만료됨", value: stats.expired, tone: "text-red-600", onClick: () => setFStatus("expired") },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/ajd-logo.webp" alt="아정당" className="h-8 w-auto" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">아정당 · 준법감시팀</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">준법심의번호 통합 관리</h1>
              <p className="text-sm text-slate-500">사내 준법감시 · 생명보험협회 · 손해보험협회 심의필</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={() => setAdminOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                  <Users size={16} /> 직원 관리
                </button>
              )}
              {canEdit && (
                <button onClick={() => setEditing(emptyRow())}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark">
                  <Plus size={16} /> 심의 등록
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="max-w-[160px] truncate">{userEmail}</span>
              <button onClick={onSignOut} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700">
                <LogOut size={13} /> 로그아웃
              </button>
            </div>
          </div>
        </div>

        {/* KPI 슬림 배지 */}
        <div className="mb-5 flex divide-x divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {tiles.map((t) => (
            <button key={t.label} onClick={t.onClick}
              className="flex flex-1 items-baseline gap-2 px-5 py-3 text-left transition hover:bg-slate-50">
              <span className={`text-xl font-bold tabular-nums ${t.tone}`}>{t.value}</span>
              <span className="text-xs font-medium text-slate-500">{t.label}</span>
            </button>
          ))}
        </div>

        {/* 필터바 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="심의번호 · 자료명 · 상품 · 신청자 · URL · 비고 검색"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white" />
          </div>
          <Filter size={16} className="text-slate-400" />
          <Select value={fCat} onChange={setFCat} options={["전체", ...CATEGORIES]} />
          <Select value={fMedia} onChange={setFMedia} options={["전체", ...MEDIA_TYPES]} />
          <Select value={fStatus} onChange={setFStatus}
            options={[["전체", "전체"], ["valid", "유효"], ["soon", "만료임박"], ["expired", "만료됨"], ["review", "심사중"], ["recheck", "재심"], ["rejected", "부적합"]]} />
          {(fCat !== "전체" || fMedia !== "전체" || fStatus !== "전체" || q) && (
            <button onClick={resetFilters} className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800">초기화</button>
          )}
          <button onClick={load} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50" title="새로고침">
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>

        {/* 테이블 */}
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-3 py-3">구분</th>
                  <th className="px-3 py-3">심의번호</th>
                  <th className="px-3 py-3">자료명</th>
                  <th className="px-3 py-3">매체</th>
                  <th className="px-3 py-3">유효기간</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-400">불러오는 중…</td></tr>
                )}
                {!loading && loadError && (
                  <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-red-500">
                    데이터를 불러오지 못했습니다: {loadError}
                  </td></tr>
                )}
                {!loading && !loadError && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-400">
                    표시할 심의 건이 없습니다. 우측 상단 "심의 등록"으로 추가하세요.
                  </td></tr>
                )}
                {!loading && filtered.map((r) => {
                  const st = deriveStatus(r);
                  const open = openId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`border-l-4 ${ROW_ACCENT[st.key]} cursor-pointer hover:bg-slate-50/70`}
                        onClick={() => setOpenId(open ? null : r.id)}>
                        <td className="px-2 py-3 text-slate-400">
                          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${CAT_STYLE[r.category]}`}>{r.category}</span>
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] text-slate-800">
                          {r.review_no || <span className="text-slate-300">— 미부여 —</span>}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">{r.title}</td>
                        <td className="px-3 py-3 text-slate-600">{r.media_type}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">{r.valid_to || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[st.key]}`}>
                            {st.key === "soon" && <Clock size={11} />}
                            {st.key === "expired" && <AlertTriangle size={11} />}
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button onClick={() => setEditing({ ...r, usages: [...(r.usages || [])] })}
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700" title="수정"><Pencil size={15} /></button>
                            )}
                            {isAdmin && (
                              <button onClick={() => setConfirmId(r.id)}
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="삭제"><Trash2 size={15} /></button>
                            )}
                            {!canEdit && !isAdmin && <span className="text-xs text-slate-300">열람</span>}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
                              <Detail label="상품 / 제휴사" value={r.product} />
                              <Detail label="신청일" value={r.applied_date} />
                              <Detail label="심의일" value={r.reviewed_date} />
                              <Detail label="유효기간" value={r.valid_from || r.valid_to ? `${r.valid_from || "?"} ~ ${r.valid_to || "?"}` : ""} />
                              <Detail label="신청자" value={r.applicant} />
                              <Detail label="승인자" value={r.approver} />
                              <div className="col-span-2 md:col-span-4">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">사용처</div>
                                {r.usages && r.usages.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {r.usages.map((u, i) =>
                                      u.url ? (
                                        <a key={i} href={u.url} target="_blank" rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:text-brand-700 hover:ring-brand-400">
                                          <Link2 size={12} /> <span className="font-medium">{u.channel}</span>
                                          <span className="max-w-[280px] truncate text-slate-400">{u.url}</span>
                                        </a>
                                      ) : (
                                        <span key={i} className="rounded-md bg-white px-2 py-1 text-xs text-slate-400 ring-1 ring-slate-200">{u.channel} (URL 없음)</span>
                                      )
                                    )}
                                  </div>
                                ) : (<span className="text-xs text-slate-400">등록된 사용처 없음</span>)}
                              </div>
                              {r.note && (
                                <div className="col-span-2 md:col-span-4">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">비고</div>
                                  <p className="text-sm text-slate-600">{r.note}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          ※ 행을 클릭하면 상세가 펼쳐집니다. 사내준법 번호는 등록 시 자동 생성(수정 가능), 협회 번호는 수동 입력.
          만료임박·만료 건은 상단 배지에서 바로 필터링됩니다.
        </p>
      </div>

      {adminOpen && isAdmin && (
        <AdminPanel currentEmail={userEmail} adminEmail={adminEmail} onClose={() => setAdminOpen(false)} />
      )}

      {editing && (
        <EditModal initial={editing} saving={saving} onClose={() => setEditing(null)} onSave={upsert} suggestNo={() => nextInternalNo(rows)} />
      )}

      {confirmId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">심의 건을 삭제할까요?</h3>
            <p className="mt-1 text-sm text-slate-500">삭제하면 되돌릴 수 없습니다. 부여된 심의번호 이력이 사라집니다.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={() => remove(confirmId)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{value || <span className="text-slate-300">—</span>}</div>
    </div>
  );
}

function Select({ value, onChange, options }) {
  const norm = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-brand-400">
      {norm.map(([v, label]) => (<option key={v} value={v}>{label}</option>))}
    </select>
  );
}

function EditModal({ initial, onClose, onSave, suggestNo, saving }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF({ ...f, [k]: v });
  const isInternal = f.category === "사내준법";
  const canSave = f.title.trim() && f.category && !saving;

  const addUsage = () => setF({ ...f, usages: [...(f.usages || []), { channel: "블로그", url: "" }] });
  const updateUsage = (i, k, v) => { const next = [...f.usages]; next[i] = { ...next[i], [k]: v }; setF({ ...f, usages: next }); };
  const removeUsage = (i) => setF({ ...f, usages: f.usages.filter((_, idx) => idx !== i) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">{f.id == null ? "심의 등록" : "심의 수정"}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="심의구분"><Select value={f.category} onChange={(v) => set("category", v)} options={CATEGORIES} /></Field>
          <Field label="심의번호">
            <div className="flex gap-1.5">
              <input value={f.review_no} onChange={(e) => set("review_no", e.target.value)}
                placeholder={isInternal ? "자동 생성 가능" : "협회 부여 번호 입력"} className={inp} />
              {isInternal && (
                <button onClick={() => set("review_no", suggestNo())}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-100 bg-brand-50 px-2 text-xs font-medium text-brand-700 hover:bg-brand-100" title="다음 번호 자동 생성">
                  <Wand2 size={13} /> 생성
                </button>
              )}
            </div>
          </Field>
          <Field label="자료명" full><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="광고물·게시물 제목" className={inp} /></Field>
          <Field label="대표 매체"><Select value={f.media_type} onChange={(v) => set("media_type", v)} options={MEDIA_TYPES} /></Field>
          <Field label="상품 / 제휴사"><input value={f.product} onChange={(e) => set("product", e.target.value)} className={inp} /></Field>
          <Field label="신청일"><input type="date" value={f.applied_date} onChange={(e) => set("applied_date", e.target.value)} className={inp} /></Field>
          <Field label="심의일"><input type="date" value={f.reviewed_date} onChange={(e) => set("reviewed_date", e.target.value)} className={inp} /></Field>
          <Field label="심의결과"><Select value={f.result} onChange={(v) => set("result", v)} options={RESULTS} /></Field>
          <Field label="유효기간 시작"><input type="date" value={f.valid_from} onChange={(e) => set("valid_from", e.target.value)} className={inp} /></Field>
          <Field label="유효기간 종료"><input type="date" value={f.valid_to} onChange={(e) => set("valid_to", e.target.value)} className={inp} /></Field>
          <Field label="신청자"><input value={f.applicant} onChange={(e) => set("applicant", e.target.value)} className={inp} /></Field>
          <Field label="승인자 (준법감시인)"><input value={f.approver} onChange={(e) => set("approver", e.target.value)} className={inp} /></Field>

          <Field label="사용처 (채널 + URL)" full>
            <div className="space-y-2">
              {(f.usages || []).map((u, i) => (
                <div key={i} className="flex gap-2">
                  <select value={u.channel} onChange={(e) => updateUsage(i, "channel", e.target.value)}
                    className="w-28 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand-400">
                    {MEDIA_TYPES.map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                  <input value={u.url} onChange={(e) => updateUsage(i, "url", e.target.value)} placeholder="게시 URL" className={inp} />
                  <button onClick={() => removeUsage(i)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={16} /></button>
                </div>
              ))}
              <button onClick={addUsage} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-dark">
                <Plus size={13} /> 사용처 추가
              </button>
            </div>
          </Field>

          <Field label="비고 (조건부 이행사항 등)" full>
            <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2}
              placeholder="조건부승인 이행조건·기한, 재심의 사유 등 자유 기록" className={inp} />
          </Field>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
          <button onClick={() => canSave && onSave(f)} disabled={!canSave}
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400";

function Field({ label, children, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
