"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getFirebaseAuthSessionServerSnapshot,
  getFirebaseAuthSessionSnapshot,
  parseFirebaseAuthSessionSnapshot,
  subscribeFirebaseAuthSession,
} from "@/lib/firebase-auth-session";

// 메인 GNB + 우측 유틸. layout.tsx의 헤더 nav 안에서 로고 다음에 렌더된다.
// 시안 v6 비주얼(76px 높이, 17px 메뉴, 시설 찾기 hover 메가메뉴, 우측 유틸+구분선)을
// 그대로 옮기되, 동작은 실제 라우트와 로그인 상태를 따른다.
// - GNB(시설 찾기/예약하기/예약 조회)는 라우트로 연결한다.
// - 이용 안내/공지사항은 아직 페이지가 없어 이동하지 않는다(시안과 동일한 활성 비주얼).
// - 시설 찾기는 hover 시 메가메뉴(종목별/지역별)를 연다. CSS hover/focus-within 기반.
// 항목 추가/삭제/순서는 배열에서만 관리한다. (구조 유연성 우선)
type GnbItem = {
  label: string;
  href?: string;
  mega?: boolean;
};

const GNB_ITEMS: GnbItem[] = [
  { label: "시설 찾기", href: "/gyms", mega: true },
  { label: "예약하기", href: "/gyms" },
  { label: "예약 조회", href: "/reservations" },
  { label: "이용 안내" },
  { label: "공지사항" },
];

// 메가메뉴 내용. 모든 항목은 현재 시설 찾기(/gyms)로 보낸다.
// (종목·지역 필터 쿼리는 /gyms 필터 계약이 정해지면 이 배열의 href만 채우면 된다.)
const FACILITY_MEGA: { title: string; items: string[] }[] = [
  { title: "종목별", items: ["배드민턴", "탁구", "풋살", "농구", "배구", "헬스장"] },
  { title: "지역별", items: ["금천구", "노원구", "마포구", "전체 보기"] },
];

const GNB_BASE =
  "relative flex h-full items-center px-5 text-[17px] font-bold transition after:absolute after:inset-x-5 after:bottom-0 after:h-[3px] after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:content-['']";
const GNB_LINK_CLASS = `${GNB_BASE} text-foreground hover:text-accent-strong hover:after:scale-x-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset`;
// 페이지가 없는 항목: 시안과 동일한 활성 비주얼이되 이동하지 않는다.
const GNB_NOOP_CLASS = `${GNB_BASE} cursor-default text-foreground hover:text-accent-strong hover:after:scale-x-100`;

const MEGA_TITLE_CLASS =
  "col-span-2 text-[13px] font-bold tracking-[0.04em] text-subtle";
const MEGA_LINK_CLASS =
  "flex items-center gap-2 rounded-lg px-[11px] py-2.5 text-[15.5px] text-muted transition hover:bg-accent-tint hover:text-accent-strong focus-visible:outline-none focus-visible:bg-accent-tint focus-visible:text-accent-strong";

const UTIL_LINK_CLASS =
  "rounded text-[14.5px] font-semibold text-muted transition hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
const UTIL_DISABLED_CLASS =
  "cursor-default text-[14.5px] font-semibold text-muted";

function UtilSeparator() {
  return <span className="h-[13px] w-px bg-line-strong" aria-hidden="true" />;
}

function FacilityMega() {
  return (
    <div
      className="invisible absolute left-0 top-full z-10 grid w-[600px] -translate-y-1.5 grid-cols-2 gap-x-[30px] gap-y-1.5 rounded-b-xl border border-line bg-white px-[26px] py-6 opacity-0 shadow-[0_4px_16px_rgba(15,23,42,0.09)] transition group-hover/facility:visible group-hover/facility:translate-y-0 group-hover/facility:opacity-100 group-focus-within/facility:visible group-focus-within/facility:translate-y-0 group-focus-within/facility:opacity-100"
      role="menu"
    >
      {FACILITY_MEGA.map((group, groupIndex) => (
        <div
          key={group.title}
          className="col-span-2 grid grid-cols-2 gap-x-[30px] gap-y-1.5"
        >
          <span
            className={`${MEGA_TITLE_CLASS} ${groupIndex > 0 ? "mt-3.5" : ""} mb-1.5`}
          >
            {group.title}
          </span>
          {group.items.map((item) => (
            <Link
              key={item}
              href="/gyms"
              className={MEGA_LINK_CLASS}
              role="menuitem"
            >
              <span
                className="size-1 rounded-full bg-line-strong"
                aria-hidden="true"
              />
              {item}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AppHeaderNav() {
  const snapshot = useSyncExternalStore(
    subscribeFirebaseAuthSession,
    getFirebaseAuthSessionSnapshot,
    getFirebaseAuthSessionServerSnapshot,
  );
  const session = parseFirebaseAuthSessionSnapshot(snapshot);
  const signedIn = session.ok;

  return (
    <>
      <ul className="hidden h-full flex-1 items-stretch gap-1 lg:flex">
        {GNB_ITEMS.map((item) => (
          <li
            key={item.label}
            className={`relative flex items-center ${
              item.mega ? "group/facility" : ""
            }`}
          >
            {item.href ? (
              <Link href={item.href} className={GNB_LINK_CLASS}>
                {item.label}
              </Link>
            ) : (
              <span className={GNB_NOOP_CLASS} title="준비 중">
                {item.label}
              </span>
            )}
            {item.mega ? <FacilityMega /> : null}
          </li>
        ))}
      </ul>

      <div className="ml-auto flex items-center gap-3.5">
        {signedIn ? (
          <>
            <Link href="/mypage" className={UTIL_LINK_CLASS}>
              마이페이지
            </Link>
            <UtilSeparator />
            <Link href="/reservations" className={UTIL_LINK_CLASS}>
              내 예약
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className={UTIL_LINK_CLASS}>
              로그인
            </Link>
            <UtilSeparator />
            <Link href="/signup" className={UTIL_LINK_CLASS}>
              회원가입
            </Link>
          </>
        )}
        <UtilSeparator />
        <span className={UTIL_DISABLED_CLASS} title="준비 중">
          KR
        </span>
      </div>
    </>
  );
}
