// 소셜 로그인 버튼용 브랜드 아이콘(사용자 제공 SVG를 인라인화). 원형 배경은 사용처에서 감싼다.
// 각 글자의 viewBox 여백이 달라 같은 size라도 보이는 크기가 다르므로,
// 네이버(가득 참)를 기준으로 카카오/구글/페이스북/메일 기본 size를 개별 보정해 시각 크기를 맞춘다.

type IconProps = { size?: number };

export function KakaoIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 21" fill="none" aria-hidden="true">
      <path
        d="M11.0011 0.743561C5.20048 0.743561 0.5 4.47639 0.5 9.08363C0.5 12.081 2.49169 14.7107 5.48136 16.1794C5.26218 17.0025 4.68553 19.164 4.57062 19.6258C4.42806 20.1987 4.77916 20.1923 5.00897 20.0384C5.18984 19.9165 7.88585 18.0736 9.0498 17.2805C9.68178 17.3745 10.3329 17.4237 10.9989 17.4237C16.7974 17.4237 21.5 13.6909 21.5 9.08363C21.5 4.47639 16.7995 0.743561 11.0011 0.743561Z"
        fill="#191600"
      />
    </svg>
  );
}

export function NaverIcon({ size = 30 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.1164 0.935425V10.0348L5.91731 0.935425H0.5V17.9354H5.88359V8.83606L12.0827 17.9354H17.5V14.6979V0.935425H12.1164Z"
        fill="white"
      />
    </svg>
  );
}

export function GoogleIcon({ size = 35 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 21" fill="none" aria-hidden="true">
      <path
        d="M19.6 10.6654C19.6 9.95545 19.54 9.27545 19.42 8.61545H10V12.4854H15.38C15.15 13.7354 14.44 14.7954 13.38 15.5054V18.0154H16.61C18.5 16.2754 19.59 13.7154 19.59 10.6654H19.6Z"
        fill="#4285F4"
      />
      <path
        d="M10 20.4354C12.7 20.4354 14.96 19.5354 16.62 18.0154L13.39 15.5054C12.49 16.1054 11.35 16.4555 10 16.4555C7.4 16.4555 5.19 14.6954 4.4 12.3354H1.06V14.9254C2.71 18.1954 6.09 20.4354 10 20.4354Z"
        fill="#34A853"
      />
      <path
        d="M4.4 12.3354C4.2 11.7354 4.09 11.0954 4.09 10.4354C4.09 9.77543 4.2 9.13543 4.4 8.53543V5.94543H1.06C0.38 7.29543 0 8.82543 0 10.4354C0 12.0454 0.39 13.5754 1.06 14.9254L4.4 12.3354Z"
        fill="#FBBC04"
      />
      <path
        d="M10 4.41544C11.47 4.41544 12.79 4.91544 13.82 5.91544L16.69 3.04544C14.96 1.43544 12.69 0.445437 10 0.445437C6.09 0.435437 2.71 2.67544 1.06 5.94544L4.4 8.53544C5.19 6.17544 7.39 4.41544 10 4.41544Z"
        fill="#E94235"
      />
    </svg>
  );
}

// 페이스북 'f'(다운로드 SVG 없음, 기존 손그림 유지). 글자가 세로로 길어 여백이 커서 기본 size를 키운다.
export function FacebookIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M14 9V7c0-.8.2-1.3 1.4-1.3H17V2.6c-.4-.1-1.4-.2-2.5-.2-2.5 0-4.1 1.5-4.1 4.2V9H8v3h2.4v9H14v-9h2.5l.4-3H14Z" />
    </svg>
  );
}

// 이메일(봉투). 봉투가 납작해 여백이 커서 기본 size를 키운다.
export function MailIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
