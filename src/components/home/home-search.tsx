"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/app-button";
import { SelectMenu } from "@/components/ui/select-menu";
import { SPORTS } from "@/lib/domain-constants";
import type { Gym, Sport } from "@/types/domain";

/**
 * 홈 빠른 검색바(지역 → 종목 → 체육관 cascade).
 * 수정 시안대로 제목·설명 없이 검색바 한 줄로 심플하게, 히어로 하단에 살짝 걸친다.
 * 앞 단계 선택이 다음 단계 후보를 좁히고, 체육관을 고르면 시설 상세로 이동한다.
 * 검색은 "시설 찾기"에 집중하고, 날짜·시간·종목별 예약은 시설 상세에서 이어서 한다.
 *
 * 데이터는 홈 page(server)가 gym 목록에서 필요한 필드만 projection해 내려준다.
 */
type SearchGym = Pick<Gym, "id" | "name" | "region" | "sports">;

type HomeSearchProps = {
  gyms: SearchGym[];
};

const FIELD_LABEL_CLASS = "text-[12.5px] font-bold text-subtle";
// SelectMenu 트리거 룩(기존 select 컨트롤과 동일한 높이·radius·보더). 화살표/목록 톤은 SelectMenu 공통.
const FIELD_TRIGGER_CLASS =
  "h-12 rounded-[10px] border border-line-strong bg-white px-3.5 text-[15px] transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2";

export function HomeSearch({ gyms }: HomeSearchProps) {
  const t = useTranslations("Home");
  const router = useRouter();
  const [region, setRegion] = useState("");
  const [sport, setSport] = useState<Sport | "">("");
  const [gymId, setGymId] = useState("");

  // 지역: 등록된 체육관의 지역 전체(가나다 정렬). 첫 단계라 항상 활성.
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const gym of gyms) set.add(gym.region);
    return Array.from(set).sort((left, right) => left.localeCompare(right, "ko"));
  }, [gyms]);

  // 종목: 선택한 지역의 체육관이 가진 종목만(도메인 표준 순서 SPORTS).
  const sportOptions = useMemo(() => {
    const available = new Set<Sport>();
    for (const gym of gyms) {
      if (region && gym.region !== region) continue;
      for (const item of gym.sports) available.add(item);
    }
    return SPORTS.filter((item) => available.has(item));
  }, [gyms, region]);

  // 체육관: 선택한 지역 + 종목에 맞는 목록(이름순).
  const gymOptions = useMemo(() => {
    return gyms
      .filter(
        (gym) =>
          (!region || gym.region === region) &&
          (!sport || gym.sports.includes(sport)),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  }, [gyms, region, sport]);

  // 지역이 바뀌면 종목·체육관을, 종목이 바뀌면 체육관을 초기화해 cascade 정합성을 유지한다.
  const handleRegionChange = (value: string) => {
    setRegion(value);
    setSport("");
    setGymId("");
  };

  const handleSportChange = (value: string) => {
    setSport(value as Sport | "");
    setGymId("");
  };

  const canSubmit = gymId !== "";

  const handleSubmit = () => {
    if (!gymId) return;
    // 검색은 "시설 찾기"이므로 시설 상세로 이동한다(종목·날짜·시간은 상세에서 이어서 선택).
    router.push(`/gyms/${gymId}`);
  };

  return (
    <section className="relative z-10 mx-auto mt-12 w-full max-w-[1440px] px-5 sm:px-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end"
      >
        {/* 지역 */}
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchRegion")}</span>
          <SelectMenu
            value={region}
            options={[
              { value: "", label: t("searchRegionAll") },
              ...regionOptions.map((item) => ({ value: item, label: item })),
            ]}
            placeholder={t("searchRegionAll")}
            ariaLabel={t("searchRegion")}
            onChange={handleRegionChange}
            triggerClassName={FIELD_TRIGGER_CLASS}
          />
        </div>

        {/* 종목 */}
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchSport")}</span>
          <SelectMenu
            value={sport}
            options={sportOptions.map((item) => ({ value: item, label: item }))}
            placeholder={t("searchSportPlaceholder")}
            ariaLabel={t("searchSport")}
            onChange={handleSportChange}
            triggerClassName={FIELD_TRIGGER_CLASS}
          />
        </div>

        {/* 체육관 */}
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchGym")}</span>
          <SelectMenu
            value={gymId}
            options={gymOptions.map((gym) => ({ value: gym.id, label: gym.name }))}
            placeholder={sport ? t("searchGymPlaceholder") : t("searchGymFirst")}
            ariaLabel={t("searchGym")}
            disabled={!sport}
            onChange={setGymId}
            triggerClassName={FIELD_TRIGGER_CLASS}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          className="h-12 w-full gap-2 sm:col-span-2 lg:col-span-1"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-[18px]"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          {t("searchSubmit")}
        </Button>
      </form>
    </section>
  );
}
