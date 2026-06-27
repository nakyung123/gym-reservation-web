import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 보안 헤더용 CSP는 Report-Only로 도입한다.
// Content-Security-Policy-Report-Only는 브라우저가 위반을 콘솔에 "보고만" 하고
// 실제 차단은 하지 않으므로, Firebase Auth / Supabase / reCAPTCHA(App Check) 흐름이
// 깨지지 않는다. 일정 기간 위반 보고를 모니터링해 누락 origin을 채운 뒤,
// 헤더 이름을 "Content-Security-Policy"로 바꿔 enforce로 전환한다.
// (.env.example의 App Check "등록 → 모니터링 → enforcement ON"과 동일한 점진 도입.)
//
// enforce 전환 시: script-src의 'unsafe-inline'은 nonce 기반으로 강화 검토.
// (nonce는 proxy.ts에서 요청별 생성 + layout 주입이 필요해 별도 작업.)
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 운영 배너는 Supabase Storage public URL. next/image data:/blob: 미리보기 허용.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // Tailwind/Next가 인라인 <style>을 주입하므로 style은 'unsafe-inline'이 필요하다.
  "style-src 'self' 'unsafe-inline'",
  // script는 아직 nonce 미배선이라 'unsafe-inline' 포함. reCAPTCHA(App Check) 스크립트 origin 허용.
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com",
  // Firebase Auth/App Check + Supabase 클라이언트 연결 origin.
  // (카카오/네이버 OAuth는 서버사이드 fetch + top-level redirect라 connect-src 불필요.)
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com https://*.supabase.co",
  // reCAPTCHA 위젯 iframe.
  "frame-src 'self' https://www.google.com",
].join("; ");

// 즉시 enforce해도 안전한 헤더(앱 origin에 의존하지 않음).
const securityHeaders: { key: string; value: string }[] = [
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  // 클릭재킹 차단(구형 브라우저 포함). CSP frame-ancestors와 이중 방어.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 불필요한 강력 권한 기능 비활성화(공격 표면 축소).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// HSTS는 HTTPS에서만 의미가 있어 production에서만 전송한다.
// (로컬 http/localhost는 브라우저가 HSTS를 무시하므로 dev에 영향 없음.)
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  images: {
    // next/image는 원본을 받아 자체 재인코딩해 서빙한다(기본 quality 75).
    // 사진·일러스트 화질을 위해 90을 허용 목록에 추가한다(Next 16은 기본 외 quality를
    // 쓰려면 명시 화이트리스트 필요). 컴포넌트에서 quality={90}로 지정해 사용한다.
    qualities: [75, 90],
    // 외부 이미지(운영 배너 등)는 Supabase Storage public URL을 쓴다.
    // next/image 최적화를 위해 해당 호스트를 허용한다.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // 모든 경로에 보안 헤더 적용.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// 쿠키 기반 i18n(URL 라우팅 없음). 기본 요청 설정은 src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
