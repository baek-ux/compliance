// 직원/관리자 초대 (admin 전용). service_role 은 이 서버 코드에서만 사용.
// 배포:  supabase functions deploy invite-user
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) 호출자 신원 확인
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "인증이 필요합니다." }, 401);

    // 2) 호출자가 관리자인지 확인 (service_role 로 조회)
    const admin = createClient(url, service);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "admin") return json({ error: "관리자 권한이 필요합니다." }, 403);

    // 3) 초대
    const { email, role, redirectTo } = await req.json();
    if (!email) return json({ error: "email 이 필요합니다." }, 400);
    const finalRole = role === "admin" ? "admin" : "staff";

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role: finalRole },
      redirectTo,
    });
    if (error) return json({ error: error.message }, 400);

    // 4) 프로필 role 확정 (트리거가 staff 로 만들었을 수 있으므로 보정)
    if (data?.user) {
      await admin.from("profiles").upsert({ id: data.user.id, email, role: finalRole });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
