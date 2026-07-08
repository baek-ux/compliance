// 곧 만료되는 심의 자동 알림 (매일 09:00 KST cron)
// - 외부심의(생보/손보): 유효종료 D-30 이내
// - 내부심의(사내준법): 유효종료 D-10 이내
// - 이미 만료된 건(D-0 지남)은 제외
// - 수신자 1명(준법 관리 팀장) 에게 1통, 섹션 구분, 담당자명 정렬
//
// 필요한 환경변수(Function Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (자동 주입)
//   RESEND_API_KEY   (resend.com 에서 발급)
//   NOTIFY_TO        (수신자 이메일. 예: alic@ajd.co.kr)
//   NOTIFY_FROM      (발신자. 예: onboarding@resend.dev 또는 noreply@ajd.co.kr)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INTERNAL_DAYS = 10; // 내부(사내준법) 임박 기준
const EXTERNAL_DAYS = 30; // 외부(생보/손보) 임박 기준
const EXTERNAL_CATS = ["생보협회", "손보협회"];

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );
    const TO = Deno.env.get("NOTIFY_TO");
    const FROM = Deno.env.get("NOTIFY_FROM") || "onboarding@resend.dev";
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!TO || !RESEND_KEY) {
      return json({ error: "NOTIFY_TO 또는 RESEND_API_KEY 미설정" }, 500);
    }

    // KST 기준 오늘 날짜
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600 * 1000);
    const today = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));

    const { data: rows, error } = await supabase
      .from("review_number")
      .select("category, review_no, title, valid_to, applicant, usages, result");
    if (error) return json({ error: error.message }, 500);

    const dday = (validTo) => {
      if (!validTo) return null;
      const d = new Date(validTo + "T00:00:00Z");
      return Math.round((d - today) / 86400000);
    };
    const firstUrl = (usages) => {
      if (!Array.isArray(usages)) return "";
      const u = usages.find((x) => x && x.url && String(x.url).trim());
      return u ? u.url : "";
    };
    // 부적합/재심 등 종료건은 제외, 유효/승인/조건부만 대상
    const active = (r) => !["부적합", "재심"].includes(r.result);

    const pick = (cats, limit) =>
      (rows || [])
        .filter((r) => cats.includes(r.category) && active(r))
        .map((r) => ({ ...r, d: dday(r.valid_to) }))
        .filter((r) => r.d !== null && r.d >= 0 && r.d <= limit) // 임박 & 아직 만료 안 됨
        .sort((a, b) => String(a.applicant || "").localeCompare(String(b.applicant || ""), "ko")); // 담당자명 정렬

    const external = pick(EXTERNAL_CATS, EXTERNAL_DAYS);
    const internal = pick(["사내준법"], INTERNAL_DAYS);

    // 임박 건 0이면 발송 스킵(선택). 필요하면 항상 발송으로 바꿔도 됨.
    if (external.length === 0 && internal.length === 0) {
      return json({ ok: true, sent: false, reason: "임박 건 없음" });
    }

    const line = (r) =>
      `담당자 : ${r.applicant || "-"}   ${r.review_no || "(번호미부여)"}   url : ${firstUrl(r.usages) || "-"}   D-${r.d}`;

    const section = (title, list) =>
      list.length
        ? `【${title}】 (${list.length}건)\n` + list.map(line).join("\n")
        : "";

    const plainParts = [
      section("외부심의 마감임박", external),
      section("내부심의 마감임박", internal),
    ].filter(Boolean);
    const plain = plainParts.join("\n\n");

    const htmlSection = (title, list) =>
      list.length
        ? `<div style="margin:0 0 18px"><div style="font-weight:700;color:#145CE6;margin-bottom:6px">${title} (${list.length}건)</div>` +
          list
            .map(
              (r) =>
                `<div style="font-family:monospace;font-size:13px;line-height:1.9;color:#1f2937">담당자 : <b>${esc(
                  r.applicant || "-"
                )}</b>&nbsp;&nbsp;&nbsp;${esc(r.review_no || "(번호미부여)")}&nbsp;&nbsp;&nbsp;url : ${
                  firstUrl(r.usages)
                    ? `<a href="${esc(firstUrl(r.usages))}">${esc(firstUrl(r.usages))}</a>`
                    : "-"
                }&nbsp;&nbsp;&nbsp;<b>D-${r.d}</b></div>`
            )
            .join("") +
          `</div>`
        : "";

    const dateStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
    const html = `
      <div style="max-width:640px;font-family:'Apple SD Gothic Neo',sans-serif;color:#1f2937">
        <div style="font-size:13px;color:#6b7280;margin-bottom:2px">아정당 준법감시 · 심의 마감 알림</div>
        <div style="font-size:18px;font-weight:800;margin-bottom:14px">${dateStr} 기준 마감임박 심의</div>
        ${htmlSection("외부심의 마감임박", external)}
        ${htmlSection("내부심의 마감임박", internal)}
        <div style="font-size:12px;color:#9ca3af;margin-top:10px">외부 D-30 · 내부 D-10 이내 (만료된 건 제외) · 담당자명 정렬</div>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: `[준법] ${dateStr} 마감임박 심의 ${external.length + internal.length}건`,
        text: plain,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: "Resend 발송 실패: " + t }, 502);
    }
    return json({ ok: true, sent: true, external: external.length, internal: internal.length });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
