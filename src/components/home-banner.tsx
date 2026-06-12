import Image from "next/image";
import { listActiveBanners } from "@/lib/server/db-banner-repository";

// 홈 운영 배너(서버 컴포넌트). 활성 + 노출기간 필터를 통과한 배너 중 정렬 우선 첫 번째를
// 단일로 노출한다(v1). Prisma 직접 조회라 매 요청 동적 평가되어 admin 변경이 즉시 반영된다
// (별도 캐시/무효화 불필요). 활성 배너가 없으면 아무것도 렌더하지 않는다.
//
// 홈 page.tsx에 <HomeBanner /> 섹션을 추가하면 노출된다(배치는 홈 레이아웃/디자인 영역).
export async function HomeBanner() {
  const banners = await listActiveBanners();
  const banner = banners[0];
  if (!banner) {
    return null;
  }

  const image = (
    <Image
      src={banner.imageUrl}
      alt={banner.title ?? "배너"}
      fill
      sizes="(max-width: 1440px) 100vw, 1440px"
      priority
      className="object-cover"
    />
  );

  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 pt-6 sm:px-8">
      <div className="relative aspect-[1440/360] w-full overflow-hidden rounded-2xl border border-line bg-slate-50">
        {banner.linkUrl ? (
          <a
            href={banner.linkUrl}
            rel="noopener noreferrer"
            className="block h-full w-full"
          >
            {image}
          </a>
        ) : (
          image
        )}
      </div>
    </section>
  );
}
