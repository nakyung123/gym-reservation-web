"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Gym } from "@/types/domain";
import { formatGymPrice, getGymSportPrice } from "@/lib/gym-utils";
import { useFavorites } from "@/hooks/use-favorites";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

// 체육관 상세 (PC). 사이트 표준 컨테이너(max-w-1440).
// 상단: 좌측 사진 + 우측 시설 요약(2단). 하단: 탭(예약 정보·지도·준수사항) + 예약하기.
// 탭은 문의·FAQ 페이지 탭 메뉴와 동일 스타일을 재사용한다.
// 우측=요약 / 예약 정보 탭=상세 로 역할을 나눈다.
// 데이터에 없는 항목(대상/이용기간/접수기간/선정방법 등)은 만들지 않고 보유 필드로만 채운다.

type Tab = "info" | "map" | "rules";

const TABS: [Tab, string][] = [
  ["info", "예약 정보"],
  ["map", "지도"],
  ["rules", "준수사항"],
];

export function GymDetailView({
  gym,
  thumbnail,
}: {
  gym: Gym;
  thumbnail: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("info");

  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(gym.id);

  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const reservePath = `/reserve/${gym.id}`;
  const closed = gym.closedDays.length > 0 ? gym.closedDays.join(", ") : "연중무휴";
  const isPaid = gym.basePrice > 0;

  function handleReserve() {
    if (session.ok) {
      router.push(reservePath);
      return;
    }
    setShowLoginModal(true);
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-5 py-10 text-foreground sm:px-8 sm:py-12">
      {/* breadcrumb */}
      <nav aria-label="breadcrumb" className="text-[13px] text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition hover:text-accent-strong">
              홈
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li>
            <Link href="/gyms" className="transition hover:text-accent-strong">
              시설 찾기
            </Link>
          </li>
          <li aria-hidden="true" className="text-line-strong">
            /
          </li>
          <li className="font-semibold text-foreground">{gym.name}</li>
        </ol>
      </nav>

      {/* 제목 + 즐겨찾기(별) */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-tight text-foreground sm:text-[32px]">
          {gym.name}
        </h1>
        <button
          type="button"
          onClick={() => toggleFavorite(gym.id)}
          aria-pressed={favorite}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-white shadow-sm transition hover:border-accent"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={favorite ? "#f5b50a" : "none"}
            stroke={favorite ? "#f5b50a" : "#9b9b9b"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />
          </svg>
        </button>
      </div>

      {/* 상단 2단: 좌측 사진 + 우측 시설 요약 */}
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-[60px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#e8eefb]">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={gym.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 700px"
              className="object-cover"
            />
          ) : null}
        </div>

        <dl className="flex h-full flex-col divide-y divide-line">
          <SummaryRow label="장소" value={gym.address} />
          <SummaryRow label="시설 사용 시간" value={gym.openHours} />
          <SummaryRow label="휴무일" value={closed} />
          <SummaryRow
            label="이용요금"
            value={isPaid ? `${formatGymPrice(gym.basePrice)}부터` : "무료"}
          />
          {gym.facilities.length > 0 ? (
            <SummaryRow label="편의시설" value={gym.facilities.join(", ")} />
          ) : null}
          <SummaryRow label="예약방법" value="인터넷" />
          <SummaryRow label="취소 기간" value="예약 전 2시간까지" />
        </dl>
      </div>

      {/* 탭 (문의·FAQ 페이지 탭 메뉴와 동일 스타일) */}
      <div className="relative isolate mt-12 scroll-mt-24">
        <nav aria-label="상세 정보" className="grid grid-cols-3">
          {TABS.map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 py-4 text-center text-[18px] transition sm:text-[22px] ${
                  active
                    ? "border-accent font-bold text-accent-strong"
                    : "border-transparent font-medium text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[calc(50%_-_50vw)] -z-10 h-px w-screen bg-line"
        />
      </div>

      <div className="mt-9">
        {tab === "info" ? <InfoTab gym={gym} isPaid={isPaid} /> : null}
        {tab === "map" ? <MapTab gym={gym} /> : null}
        {tab === "rules" ? <RulesTab /> : null}
      </div>

      {/* 예약하기 (맨 아래) — 윗부분과 구분선으로 영역을 나눈다 */}
      <div className="mt-12 border-t border-line pt-10">
        <button
          type="button"
          onClick={handleReserve}
          className="mx-auto block h-14 w-full max-w-[320px] rounded-full bg-accent text-[18px] font-bold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          예약하기
        </button>
      </div>

      {showLoginModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reserve-gate-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 id="reserve-gate-title" className="text-lg font-bold text-slate-950">
              로그인이 필요합니다
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              예약을 진행하려면 로그인해 주세요.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/login?from=${encodeURIComponent(reservePath)}`)
                }
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                로그인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// 우측 시설 요약 한 행 (라벨 : 값).
// flex-1로 좌측 사진 높이에 맞춰 행을 균등 분배하고, 값은 세로 가운데 정렬한다.
// 라벨은 항상 한 줄로 유지(가장 긴 "시설 사용 시간" 기준 폭 확보).
function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center gap-3 py-3">
      <dt className="w-32 shrink-0 whitespace-nowrap text-[19px] font-bold text-foreground">
        {label}
      </dt>
      <dd className="flex-1 text-[19px] leading-relaxed text-muted">{value}</dd>
    </div>
  );
}

// 예약 정보 탭(상세): 종목·종목별 요금·소개·취소 안내.
function InfoTab({ gym, isPaid }: { gym: Gym; isPaid: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <DetailRow label="종목" value={gym.sports.join(", ")} />
      <DetailRow
        label="종목별 요금"
        value={
          isPaid ? (
            <ul className="flex max-w-md flex-col gap-1">
              {gym.sports.map((sport) => (
                <li key={sport} className="flex justify-between gap-4">
                  <span>{sport}</span>
                  <span className="font-medium text-foreground">
                    {formatGymPrice(getGymSportPrice(gym, sport))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            "무료"
          )
        }
      />
      {gym.description ? <DetailRow label="소개" value={gym.description} /> : null}
      <DetailRow
        label="이용 안내"
        value={
          <div className="flex flex-col gap-2">
            <p>
              예약은 로그인 후 본 페이지의 예약하기 버튼을 통해 진행하며, 신청 시점에
              남은 시간대를 실시간으로 확인할 수 있습니다.
            </p>
            <p>
              한 계정으로 동일 시간대에 중복 신청은 불가하며, 예약이 확정되면 마이페이지
              예약 내역과 QR 체크인에서 입장 정보를 확인할 수 있습니다.
            </p>
            <p>
              현장 입장 시 예약자 본인 확인이 필요할 수 있으니 예약 내역을 미리 준비해
              주세요.
            </p>
          </div>
        }
      />
      <DetailRow
        label="취소·환불 안내"
        value={
          <div className="flex flex-col gap-2">
            <p>
              환불·취소 기준은 각 시설의 운영 정책을 따르며, 이용일 기준으로 취소 가능
              기간과 환불 비율이 달라질 수 있습니다.
            </p>
            <p>
              취소는 마이페이지 예약 내역에서 직접 진행할 수 있으며, 정확한 기준은 예약
              진행 화면과 각 시설 안내를 확인해 주세요.
            </p>
          </div>
        }
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[17px] font-bold text-foreground">{label}</p>
      <div className="mt-1 text-[16px] leading-relaxed text-muted">{value}</div>
    </div>
  );
}

function MapTab({ gym }: { gym: Gym }) {
  const mapSrc = `https://www.google.com/maps?q=${gym.latitude},${gym.longitude}&z=16&hl=ko&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${gym.latitude},${gym.longitude}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-line">
        <iframe
          title={`${gym.name} 위치`}
          src={mapSrc}
          loading="lazy"
          className="h-115 w-full"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="text-[16px] text-muted">{gym.address}</p>
      <a
        href={mapLink}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-[15px] font-semibold text-accent-strong underline-offset-2 hover:underline"
      >
        큰 지도에서 보기
      </a>
    </div>
  );
}

function RulesTab() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[20px] font-bold text-foreground">필수 준수사항</h2>
      <div className="flex max-w-3xl flex-col gap-4 text-[16px] leading-relaxed text-muted">
        <p>
          모든 서비스의 이용은 담당 기관의 규정에 따릅니다. 각 시설의 규정·허가조건을
          반드시 준수하여야 하며, 안내 사항을 지키지 않아 발생하는 불이익은 이용자
          본인에게 책임이 있습니다.
        </p>
        <p>
          각 관리기관의 시설물과 부대시설을 이용함에 있어 담당자들과 협의 후 사용하며,
          예약한 시간과 용도 범위 안에서만 시설을 이용해야 합니다. 시설 및 비품을
          훼손한 경우 원상 복구 또는 그에 따른 비용을 부담할 수 있습니다.
        </p>
        <p>
          예약자 본인 외 타인에게 예약을 양도하거나 무단으로 사용하게 할 수 없으며,
          현장에서 예약자 본인 확인을 요청할 수 있습니다.
        </p>
        <p>
          시설 이용 중 발생한 안전사고에 대해서는 각 관리기관과 서울시에서 책임을 지지
          않으므로, 이용자는 안전 수칙을 준수하고 필요한 경우 개인 보험 등에 가입하시기
          바랍니다.
        </p>
        <p>
          시설 이용료 납부는 각 관리기관의 규정에 준합니다. 본 사이트와 각 관리기관의
          규정을 위반할 시에는 시설 이용 취소 및 시설 이용 불허의 조치를 취할 수 있으며,
          반복 위반 시 서비스 이용이 제한될 수 있습니다.
        </p>
      </div>
    </div>
  );
}
