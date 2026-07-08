// NAVER WORKS 직접 로그인 (OIDC Implicit Flow, response_type=id_token)
// - Supabase Auth 를 거치지 않고 브라우저가 ID Token 을 직접 받는다.
// - Client Secret 불필요(토큰 교환 없음) → 프론트만으로 동작.
// - 보안 주의: ID Token 서명(JWKS) 검증은 하지 않는다(사내 내부도구 전제).
//   위조 토큰을 막으려면 서버(Edge Function)에서 JWKS 검증이 필요하지만,
//   현재는 사내 전원 열람 허용 + 민감 고객정보 아님이라 생략.

const AUTHORIZE_URL = "https://auth.worksmobile.com/oauth2/v2.0/authorize";

// 네이버웍스 앱의 Client ID (공개값 — URL 에 노출되어도 되는 값).
// Vercel 환경변수 VITE_NAVERWORKS_CLIENT_ID 로 주입.
const CLIENT_ID = import.meta.env.VITE_NAVERWORKS_CLIENT_ID;

export const naverworksConfigured = Boolean(CLIENT_ID);

function randomString(len = 24) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ("0" + b.toString(16)).slice(-2)).join("");
}

// 로그인 시작: 네이버웍스 인증 페이지로 리다이렉트
export function startLogin() {
  const state = randomString();
  const nonce = randomString();
  sessionStorage.setItem("nw_state", state);
  sessionStorage.setItem("nw_nonce", nonce);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin, // 앱 주소 (네이버웍스 앱에 등록 필요)
    response_type: "id_token",
    scope: "openid email profile",
    state,
    nonce,
  });
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

// base64url → JSON (JWT payload 디코드, 서명검증 없음)
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// 리다이렉트로 돌아온 URL 해시(#id_token=...&state=...)를 파싱.
// 성공 시 { email, name, exp, raw } 반환, 실패/없음 시 null.
export function consumeRedirect() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!hash) return null;

  const p = new URLSearchParams(hash);
  const idToken = p.get("id_token");
  const state = p.get("state");
  const err = p.get("error");

  // 해시 정리(토큰이 주소창에 남지 않도록)
  const clean = () =>
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (err) {
    clean();
    return { error: p.get("error_description") || err };
  }
  if (!idToken) return null;

  // state 검증 (CSRF 방지)
  const savedState = sessionStorage.getItem("nw_state");
  if (savedState && state && savedState !== state) {
    clean();
    return { error: "state 불일치 — 다시 로그인해 주세요." };
  }

  const claims = decodeJwtPayload(idToken);
  clean();
  if (!claims || !claims.email) {
    return { error: "로그인 정보를 읽지 못했습니다(email 없음)." };
  }

  // nonce 검증 (있으면)
  const savedNonce = sessionStorage.getItem("nw_nonce");
  if (savedNonce && claims.nonce && savedNonce !== claims.nonce) {
    return { error: "nonce 불일치 — 다시 로그인해 주세요." };
  }
  sessionStorage.removeItem("nw_state");
  sessionStorage.removeItem("nw_nonce");

  return {
    email: String(claims.email).toLowerCase(),
    name: claims.name || claims.given_name || "",
    exp: claims.exp || 0,
  };
}

// 로컬 세션 저장/복구 (새로고침 유지)
const SESSION_KEY = "nw_session";

export function saveSession(sess) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 만료 체크 (exp 초 단위)
    if (s.exp && Date.now() / 1000 > s.exp) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
