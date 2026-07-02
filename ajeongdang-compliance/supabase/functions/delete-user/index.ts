// 계정 삭제 (admin 전용). service_role 은 이 서버 코드에서만 사용.
// 배포:  supabase functions deploy delete-user
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

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "인증이 필요합니다." }, 401);

    const admin = createClient(url, service);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "admin") return json({ error: "관리자 권한이 필요합니다." }, 403);

    const { user_id } = await req.json();
    if (!user_id) return json({ error: "user_id 가 필요합니다." }, 400);
    if (user_id === user.id) return json({ error: "본인 계정은 삭제할 수 없습니다." }, 400);

    // profiles 는 auth.users on delete cascade 로 함께 삭제됨
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
