"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/app-button";
import { SPORTS } from "@/lib/domain-constants";
import { getTodayDateValue } from "@/lib/reservation-range";
import type { Gym, Sport } from "@/types/domain";

/**
 * 홈 빠른 검색바(종목 → 지역 → 체육관 → 날짜 cascade).
 * 수정 시안대로 제목·설명 없이 검색바 한 줄로 심플하게, 히어로 하단에 살짝 걸친다.
 * 앞 단계 선택이 다음 단계 후보를 좁히고, 체육관을 고르면 예약 화면으로 바로 이동한다.
 * 도착지는 예약 라우트 계약(/reserve/[gymId]?sport=&date=)을 따른다(임의 계약 신설 X).
 *
 * 데이터는 홈 page(server)가 gym 목록에서 필요한 필드만 projection해 내려준다.
 */
type SearchGym = Pick<Gym, "id" | "name" | "region" | "sports">;

type HomeSearchProps = {
  gyms: SearchGym[];
};

// 오늘로부터 days만큼 더한 YYYY-MM-DD. 예약 7일 윈도우 상한 계산용(UTC 단순 가산).
function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const FIELD_LABEL_CLASS = "text-[12.5px] font-bold text-subtle";
const FIELD_CONTROL_CLASS =
  "h-12 w-full rounded-[10px] border border-line-strong bg-white px-3.5 text-[15px] text-slate-950 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-subtle";

export function HomeSearch({ gyms }: HomeSearchProps) {
  const router = useRouter();
  const [sport, setSport] = useState<Sport | "">("");
  const [region, setRegion] = useState("");
  const [gymId, setGymId] = useState("");
  const [date, setDate] = useState("");

  // 날짜 input의 min/max는 사용자 시각 기준이라 마운트 후에만 설정한다.
  // (서버/클라 타임존 차이로 인한 hydration mismatch 방지)
  const [today, setToday] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setToday(getTodayDateValue());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 종목: 도메인 표준 순서(SPORTS)로 고정하되 등록된 체육관이 가진 것만 노출.
  const sportOptions = useMemo(() => {
    const available = new Set<Sport>();
    for (const gym of gyms) {
      for (const item of gym.sports) available.add(item);
    }
    return SPORTS.filter((item) => available.has(item));
  }, [gyms]);

  // 지역: 선택한 종목을 가진 체육관의 지역만(가나다 정렬).
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const gym of gyms) {
      if (sport && !gym.sports.includes(sport)) continue;
      set.add(gym.region);
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right, "ko"));
  }, [gyms, sport]);

  // 체육관: 선택한 종목 + 지역에 맞는 목록(이름순).
  const gymOptions = useMemo(() => {
    return gyms
      .filter(
        (gym) =>
          (!sport || gym.sports.includes(sport)) &&
          (!region || gym.region === region),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "ko"));
  }, [gyms, sport, region]);

  // 종목/지역이 바뀌면 하위 선택을 초기화해 cascade 정합성을 유지한다.
  const handleSportChange = (value: string) => {
    setSport(value as Sport | "");
    setRegion("");
    setGymId("");
  };

  const handleRegionChange = (value: string) => {
    setRegion(value);
    setGymId("");
  };

  const canSubmit = gymId !== "";

  const handleSubmit = () => {
    if (!gymId) return;
    const params = new URLSearchParams();
    if (sport) params.set("sport", sport);
    if (date) params.set("date", date);
    const query = params.toString();
    router.push(`/reserve/${gymId}${query ? `?${query}` : ""}`);
  };

  return (
    <section className="relative z-10 mx-auto -mt-[40px] w-full max-w-[1440px] px-5 sm:px-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.16)] sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>종목</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={sport}
            onChange={(event) => handleSportChange(event.target.value)}
          >
            <option value="">종목 선택</option>
            {sportOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>지역</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={region}
            onChange={(event) => handleRegionChange(event.target.value)}
            disabled={!sport}
          >
            <option value="">{sport ? "지역 선택" : "종목 먼저"}</option>
            {regionOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>체육관</span>
          <select
            className={FIELD_CONTROL_CLASS}
            value={gymId}
            onChange={(event) => setGymId(event.target.value)}
            disabled={!region}
          >
            <option value="">{region ? "체육관 선택" : "지역 먼저"}</option>
            {gymOptions.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASS}>날짜</span>
          <input
            type="date"
            className={FIELD_CONTROL_CLASS}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            min={today || undefined}
            max={today ? addDays(today, 6) : undefined}
            disabled={!gymId}
          />
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
          시설 검색
        </Button>
      </form>
    </section>
  );
}
