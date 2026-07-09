"use client";

import { useEffect, useState } from "react";
import { fetchUserProfile } from "@/lib/user-profile-client";
import { isAbortError } from "@/lib/async-error";
import type { UserProfile } from "@/lib/user-profile";

export type ReservationProfileStatus = "idle" | "loading" | "ready" | "error";

/**
 * 예약자 정보(회원 프로필)를 불러오는 훅.
 *
 * 예약 폼은 회원의 성명·생년월일을 표시하고, 연락처는 회원 정보를 기본값으로
 * 채우되 이 예약 건에서 수정 가능하게 한다. 그래서 phoneInput은 훅이 초기값만
 * 세팅하고 이후 편집 제어는 호출부로 넘긴다(setPhoneInput 함께 반환).
 */
export function useReservationProfile(userId: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileState, setProfileState] =
    useState<ReservationProfileStatus>("idle");
  const [phoneInput, setPhoneInput] = useState("");

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    // 조회 시작 즉시 로딩 표시(외부 fetch 동기화 목적의 의도적 set).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileState("loading");
    fetchUserProfile(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setProfile(result.profile);
          // 연락처 입력칸 기본값 = 회원 연락처(없으면 빈칸, '-' 미표시).
          setPhoneInput(result.profile?.phone?.trim() ?? "");
          setProfileState("ready");
        } else {
          setProfileState("error");
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setProfileState("error");
      });
    return () => controller.abort();
  }, [userId]);

  return { profile, profileState, phoneInput, setPhoneInput };
}
