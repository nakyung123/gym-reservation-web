"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/app-button";
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
const FIELD_CONTROL_CLASS =
  "h-12 w-full rounded-[10px] border border-line-strong bg-white px-3.5 text-[15px] text-slate-950 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-subtle";

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
    <section className="relative z-10 mx-auto -mt-[40px] w-full max-w-[1440px] px-5 sm:px-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.16)] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end"
      >
        {/* 지역 */}
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchRegion")}</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={region}
            onChange={(event) => handleRegionChange(event.target.value)}
          >
            <option value="">{t("searchRegionPlaceholder")}</option>
            {regionOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {/* 종목 */}
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchSport")}</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={sport}
            onChange={(event) => handleSportChange(event.target.value)}
            disabled={!region}
          >
            <option value="">
              {region ? t("searchSportPlaceholder") : t("searchSportFirst")}
            </option>
            {sportOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {/* 체육관 */}
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>{t("searchGym")}</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={gymId}
            onChange={(event) => setGymId(event.target.value)}
            disabled={!sport}
          >
            <option value="">
              {sport ? t("searchGymPlaceholder") : t("searchGymFirst")}
            </option>
            {gymOptions.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>

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
