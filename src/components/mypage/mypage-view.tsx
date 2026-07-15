"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useUserProfileForm } from "@/hooks/use-user-profile-form";
import { useFavorites } from "@/hooks/use-favorites";
import { MypageShell } from "./mypage-shell";
import {
  LoadingPanel,
  ErrorPanel,
  SignedOutPanel,
} from "./mypage-status-panels";
import { ReservationsPanel } from "./reservations-panel";
import { FavoritesPanel } from "./favorites-panel";
import { InquiriesPanel } from "./inquiries-panel";
import { AccountPanel } from "./account-panel";
import { AccountGate } from "./account-gate";
import { parsePage, parseTab, TABS } from "./mypage-utils";
import type { Gym } from "@/types/domain";

/**
 * 마이페이지 최상위 뷰.
 *
 * 책임: URL 탭 파싱 → 인증 상태 분기 → 탭별 패널 마운트.
 * 각 패널의 데이터 로딩·mutation은 패널 자신(또는 전용 훅)이 담당한다.
 * 회원정보 탭은 비밀번호 회원에 한해 재인증 게이트(AccountGate)를 먼저 거친다.
 */
export function MypageView({ gyms }: { gyms: Gym[] }) {
  const t = useTranslations("Mypage");
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  useRequireAuth({ from: "/mypage" });
  const auth = useAuthUser();
  const userId = auth.status === "ready" ? auth.user.uid : null;

  // 프로필 폼 수명주기(로드/편집/저장)는 훅에 위임. 계정 전환 시 훅 내부에서 리셋된다.
  const { profileState, saveState, updateField, submit } =
    useUserProfileForm(userId);
  const { favorites, loadError: favoritesLoadError } = useFavorites();

  // 회원정보변경 게이트 통과 여부. 계정 uid가 바뀌면 다시 잠근다.
  const [gateUnlocked, setGateUnlocked] = useState(false);
  const [gateUserId, setGateUserId] = useState<string | null>(null);
  if (gateUserId !== userId) {
    // 렌더 중 상태 보정 패턴(React 공식): 계정이 바뀐 렌더에서 즉시 잠금 상태로 되돌린다.
    setGateUserId(userId);
    setGateUnlocked(false);
  }

  // 파생값: 계정 요약(이메일·비번 회원 여부). useState가 아닌 useMemo.
  // (이메일 인증은 가입 시 매직링크로 이미 완료되므로 별도 미인증 배너를 두지 않는다.)
  const account = useMemo(() => {
    if (auth.status !== "ready") return null;
    const isPasswordProvider = auth.user.providerData.some(
      (p) => p.providerId === "password",
    );
    return {
      email: auth.user.email ?? t("noEmail"),
      isPasswordProvider,
    };
  }, [auth, t]);

  // ── 인증 상태별 얼리 리턴 ──
  if (auth.status === "loading") {
    return (
      <MypageShell>
        <LoadingPanel />
      </MypageShell>
    );
  }
  if (auth.status === "error") {
    return (
      <MypageShell>
        <ErrorPanel title={t("authErrorTitle")} message={auth.message} />
      </MypageShell>
    );
  }
  if (auth.status === "signed-out" || !account) {
    return (
      <MypageShell>
        <SignedOutPanel />
      </MypageShell>
    );
  }

  // ── 탭별 패널: 중첩 삼항 대신 switch 렌더 함수로 분기 ──
  const renderPanel = () => {
    switch (tab) {
      case "reservations":
        return (
          <ReservationsPanel
            gyms={gyms}
            page={parsePage(searchParams.get("resvPage"))}
          />
        );
      case "favorites":
        return (
          <FavoritesPanel
            gyms={gyms}
            favorites={favorites}
            loadError={favoritesLoadError}
            page={parsePage(searchParams.get("favPage"))}
          />
        );
      case "inquiries":
        return (
          <InquiriesPanel
            gyms={gyms}
            page={parsePage(searchParams.get("inqPage"))}
          />
        );
      case "info":
        // 비밀번호 회원은 본인 확인 게이트를 먼저 통과해야 한다.
        if (account.isPasswordProvider && !gateUnlocked) {
          return <AccountGate onUnlock={() => setGateUnlocked(true)} />;
        }
        return (
          <AccountPanel
            email={account.email}
            isPasswordProvider={account.isPasswordProvider}
            profileState={profileState}
            saveState={saveState}
            onFieldChange={updateField}
            onSubmit={submit}
            onRelock={() => setGateUnlocked(false)}
          />
        );
    }
  };

  return (
    <MypageShell>
      {/* 탭: 문의·FAQ 탭과 동일(grid 4등분, 비활성 muted, 활성 네이비 볼드+밑줄).
          하단 구분선은 양쪽 화면 끝까지(full-bleed) 깔고, 활성 탭 밑줄이 그 위에 얹힌다. */}
      <div className="relative isolate">
        <nav
          aria-label={t("tabsAria")}
          className="grid grid-cols-2 sm:grid-cols-4"
        >
          {TABS.map((tabItem) => {
            const active = tab === tabItem.key;
            return (
              <Link
                key={tabItem.key}
                href={tabItem.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 py-4 text-center text-[18px] transition sm:text-[22px] ${
                  active
                    ? "border-accent font-bold text-accent-strong"
                    : "border-transparent font-medium text-muted hover:text-foreground"
                }`}
              >
                {t(tabItem.labelKey)}
              </Link>
            );
          })}
        </nav>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[calc(50%_-_50vw)] -z-10 h-px w-screen bg-line"
        />
      </div>

      {/* 탭↔표 간격: 그림판 지시 #4(72px) */}
      <div className="mt-[72px]">{renderPanel()}</div>
    </MypageShell>
  );
}
