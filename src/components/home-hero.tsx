/**
 * 홈 히어로(시안 .hero). 높이 420px 고정, 좌측 농도 베일 위에 흰 제목/본문.
 * 현재는 실사진 에셋이 없어 네이비 그라데이션 플레이스홀더로 채운다.
 * 나중에 사진 필드 + 통제 위치 호스팅이 갖춰지면 아래 배경 레이어(data-hero-bg)만
 * <img>로 교체하면 된다. 그라데이션/베일은 --accent 토큰을 따른다.
 *
 * 하단 여백(pb-[60px])은 퀵액션 카드(home-quick-actions)가 -88px로 겹쳐 올라올 공간이다.
 */
export function HomeHero() {
  return (
    <section className="relative h-[420px] overflow-hidden bg-slate-900">
      {/* 배경(추후 실사진으로 교체 지점) */}
      <div
        data-hero-bg
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(115deg,#0b1220_0%,var(--accent-strong)_60%,var(--accent)_100%)]"
      />
      {/* 텍스트 가독성을 위한 좌측 농도 베일(시안과 동일) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(105deg,rgba(15,23,42,0.86)_0%,rgba(15,23,42,0.55)_48%,rgba(15,23,42,0.15)_100%)]"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[1440px] flex-col justify-center px-5 pb-[60px] sm:px-8">
        <h1 className="max-w-[680px] text-[34px] font-extrabold leading-[1.26] tracking-[-0.025em] text-white sm:text-[46px]">
          동네에서 가까운 운동의 시작,
          <br />
          믿고 예약하는 생활체육
        </h1>
        <p className="mt-[18px] max-w-[640px] text-base text-[#e2e8f0] sm:text-[19px]">
          집 근처 공공 체육시설을 한눈에 보고, 빈 시간대를 골라 바로 예약하세요.
        </p>
      </div>
    </section>
  );
}
