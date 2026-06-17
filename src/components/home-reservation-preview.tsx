import { Button, ButtonLink } from "@/components/app-button";
import { getTranslations } from "next-intl/server";

/**
 * 홈의 "예약 흐름" 섹션(시안 RESERVATION). 실제 슬롯/티켓은 /reserve·/reservations에서
 * 동작하며, 이 섹션은 흐름을 보여주는 정적 예시다. 슬롯은 클릭 컨트롤이 아니라 표시용이며,
 * 실제 예약 진입은 하단 CTA(11:00 예약 진행 → /gyms)로 연결한다.
 *
 * 표시 데이터는 아래 배열/상수로 관리한다. 시안 v6의 px 값을 그대로 옮겼다.
 */
type SampleSlot = {
  time: string;
  label: string;
  state?: "selected" | "full";
};

const SAMPLE_SLOTS: SampleSlot[] = [
  { time: "07:00", label: "잔여 4" },
  { time: "09:00", label: "잔여 2" },
  { time: "11:00", label: "선택됨", state: "selected" },
  { time: "13:00", label: "잔여 6" },
  { time: "15:00", label: "마감", state: "full" },
  { time: "17:00", label: "잔여 1" },
  { time: "19:00", label: "잔여 3" },
  { time: "21:00", label: "마감", state: "full" },
];

const TICKET_ROWS: { k: string; v: string }[] = [
  { k: "시설", v: "금천 국민체육센터" },
  { k: "일시", v: "6월 12일 (금) 11:00–13:00" },
  { k: "인원", v: "2명" },
  { k: "금액", v: "12,000원" },
];

const slotStateClass: Record<
  NonNullable<SampleSlot["state"]> | "default",
  string
> = {
  default: "border-line-strong bg-white text-slate-950",
  selected: "border-accent bg-accent text-white",
  full: "border-line bg-surface-2 text-subtle",
};

const slotLeftClass: Record<
  NonNullable<SampleSlot["state"]> | "default",
  string
> = {
  default: "text-muted",
  selected: "text-white/90",
  full: "text-subtle",
};

export async function HomeReservationPreview() {
  const t = await getTranslations("Home");
  return (
    <section className="py-[72px]">
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="mb-[30px]">
          <p className="text-[13.5px] font-bold tracking-[0.06em] text-accent-strong">
            RESERVATION
          </p>
          <h2 className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-slate-950">
            {t("reservationTitle")}
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start">
          {/* 슬롯 선택(표시용) */}
          <div className="rounded-xl border border-line bg-white p-[26px]">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-[18.5px] font-bold text-slate-950">
                금천 국민체육센터 - 배드민턴
              </h3>
              <span className="text-[14.5px] text-muted tabular-nums">
                6월 12일 (금)
              </span>
            </div>

            <ul className="grid grid-cols-3 gap-[11px] sm:grid-cols-4 lg:grid-cols-6">
              {SAMPLE_SLOTS.map((slot) => {
                const state = slot.state ?? "default";
                return (
                  <li
                    key={slot.time}
                    className={`rounded-lg border px-2 py-[13px] text-center ${slotStateClass[state]}`}
                  >
                    <div className="text-base font-bold tabular-nums">
                      {slot.time}
                    </div>
                    <div className={`mt-[3px] text-[12.5px] ${slotLeftClass[state]}`}>
                      {slot.label}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 max-w-[560px] rounded-lg border border-line border-l-4 border-l-accent bg-white px-[17px] py-[15px] text-[15px] text-muted">
              {t("reservationHold")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button variant="outline">{t("reservationPrev")}</Button>
              <ButtonLink href="/gyms">{t("reservationProceed")}</ButtonLink>
            </div>
          </div>

          {/* 예약 티켓(표시용) */}
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 bg-accent px-[26px] py-[22px] text-white">
              <div>
                <p className="text-[13.5px] text-white/90">예약 확정</p>
                <p className="mt-1 text-[23px] font-extrabold">배드민턴 1면</p>
              </div>
              <span className="rounded-full bg-white/[0.22] px-3 py-[5px] text-[13px] font-bold">
                예약완료
              </span>
            </div>

            <dl className="px-[26px] pb-5 pt-2">
              {TICKET_ROWS.map((row) => (
                <div
                  key={row.k}
                  className="flex items-center justify-between gap-3 border-b border-line py-[15px] text-[15.5px] last:border-b-0"
                >
                  <dt className="text-muted">{row.k}</dt>
                  <dd className="font-semibold tabular-nums">{row.v}</dd>
                </div>
              ))}
            </dl>

            <div className="flex items-center justify-between gap-3 border-t border-dashed border-line-strong bg-surface-2 px-[26px] py-4 text-[13.5px] text-muted">
              <span>예약번호</span>
              <span className="font-mono tabular-nums tracking-[0.02em]">
                RSV-20260612-0481
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
