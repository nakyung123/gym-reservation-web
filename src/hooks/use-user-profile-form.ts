"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchUserProfile, saveUserProfile } from "@/lib/user-profile-client";
import { getErrorMessage, isAbortError } from "@/lib/async-error";
import type { UserProfile } from "@/lib/user-profile";

/** 회원정보변경 폼 값(휴대폰 본인인증 없이 직접 입력받는 항목들). */
export type ProfileFormState = {
  name: string;
  phone: string;
  birthDate: string;
  address: string;
  reservationNotificationsEnabled: boolean;
};

export type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  // loginId: 가입 시 정한 로그인 아이디(불변, 표시 전용). 미설정 계정은 null.
  | { status: "ready"; form: ProfileFormState; loginId: string | null }
  | { status: "error"; message: string; responseStatus?: number };

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; responseStatus?: number };

/** 편집 가능한 텍스트 필드 키(알림 설정 토글은 별도). */
export type ProfileTextField = "name" | "phone" | "birthDate" | "address";

const EMPTY_FORM: ProfileFormState = {
  name: "",
  phone: "",
  birthDate: "",
  address: "",
  reservationNotificationsEnabled: true,
};

function profileToForm(profile: UserProfile | null): ProfileFormState {
  if (!profile) return { ...EMPTY_FORM };
  return {
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    birthDate: profile.birthDate ?? "",
    address: profile.address ?? "",
    reservationNotificationsEnabled: profile.reservationNotificationsEnabled,
  };
}

/** 빈 문자열은 null로 보내 서버가 "값 삭제"로 해석하게 한다. */
function nullifyText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** 오류에 HTTP status가 있으면 콘솔에 남긴다(운영 진단용). */
function logErrorStatus(context: string, message: string, status?: number) {
  if (status !== undefined) {
    console.error(`[mypage:${context}] status=${status} ${message}`);
  }
}

/**
 * 회원정보 폼의 전체 수명주기(로드 → 편집 → 저장)를 관리하는 훅.
 *
 * mypage-view에 흩어져 있던 프로필 fetch effect + 저장 핸들러 + abort 방어 로직을
 * UI에서 분리한다. 화면은 profileState/saveState만 그려주면 된다.
 *
 * 방어 로직:
 * - userId가 바뀌면(계정 전환/로그아웃) 진행 중 요청을 abort하고 폼을 다시 로드한다.
 * - 응답의 uid가 요청 시점 계정과 다르면 명시적 오류로 처리한다(교차 계정 응답 방지).
 * - 재저장 시 이전 저장 요청을 abort한다(마지막 요청만 유효 — 반복 클릭에 안전).
 */
export function useUserProfileForm(userId: string | null) {
  const [profileState, setProfileState] = useState<ProfileState>({
    status: "idle",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const saveAbortRef = useRef<AbortController | null>(null);
  // 현재 유효한 계정 uid. 저장 응답 도착 시점에 계정이 바뀌었는지 판별하는 기준.
  const activeUserIdRef = useRef<string | null>(null);

  // ── 로드: userId 확정 시 1회. 계정 전환 시 재로드 + 진행 중 저장 취소 ──
  /* eslint-disable react-hooks/set-state-in-effect -- 외부 fetch 동기화 목적의 의도적 set */
  useEffect(() => {
    activeUserIdRef.current = userId;
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    setSaveState({ status: "idle" });

    if (!userId) {
      setProfileState({ status: "idle" });
      return;
    }
    setProfileState({ status: "loading" });
    const controller = new AbortController();
    fetchUserProfile(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          logErrorStatus("profile-fetch", result.message, result.status);
          setProfileState({
            status: "error",
            message: result.message,
            responseStatus: result.status,
          });
          return;
        }
        if (result.user.uid !== userId) {
          // 응답이 다른 계정의 것이면 그대로 쓰지 않고 명시적 오류로 노출한다.
          setProfileState({
            status: "error",
            message:
              "회원정보 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
          });
          return;
        }
        setProfileState({
          status: "ready",
          form: profileToForm(result.profile),
          loginId: result.profile?.loginId ?? null,
        });
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setProfileState({
          status: "error",
          message: `회원정보를 불러오는 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
        });
      });
    return () => controller.abort();
  }, [userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── 편집: 필드 하나 갱신. 새 입력이 생기면 이전 저장 성공/실패 알림은 해제한다 ──
  const updateField = (field: ProfileTextField, value: string) => {
    setProfileState((prev) =>
      prev.status === "ready"
        ? { ...prev, form: { ...prev.form, [field]: value } }
        : prev,
    );
    setSaveState((prev) => (prev.status === "idle" ? prev : { status: "idle" }));
  };

  // ── 저장 ──
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileState.status !== "ready" || !userId) return;
    const submittingUserId = userId;
    const input = {
      name: nullifyText(profileState.form.name),
      phone: nullifyText(profileState.form.phone),
      birthDate: nullifyText(profileState.form.birthDate),
      address: nullifyText(profileState.form.address),
      reservationNotificationsEnabled:
        profileState.form.reservationNotificationsEnabled,
    };

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    setSaveState({ status: "saving" });
    try {
      const result = await saveUserProfile(input, controller.signal);
      // 그 사이 계정이 바뀌었거나 더 새 저장 요청이 시작됐으면 이 응답은 버린다.
      if (
        saveAbortRef.current !== controller ||
        activeUserIdRef.current !== submittingUserId
      ) {
        return;
      }
      if (!result.ok) {
        logErrorStatus("profile-save", result.message, result.status);
        setSaveState({
          status: "error",
          message: result.message,
          responseStatus: result.status,
        });
        return;
      }
      if (result.user.uid !== submittingUserId) {
        setSaveState({
          status: "error",
          message: "회원정보 응답의 사용자 정보가 현재 로그인 계정과 다릅니다.",
        });
        return;
      }
      // 저장 성공: 서버가 확정한 값으로 폼을 동기화한다(이중 상태 관리 방지).
      setProfileState({
        status: "ready",
        form: profileToForm(result.profile),
        loginId: result.profile?.loginId ?? null,
      });
      setSaveState({ status: "success", message: result.message });
    } catch (error) {
      if (isAbortError(error)) return;
      if (
        saveAbortRef.current !== controller ||
        activeUserIdRef.current !== submittingUserId
      ) {
        return;
      }
      setSaveState({
        status: "error",
        message: `회원정보 저장 중 오류가 발생했습니다. ${getErrorMessage(error)}`,
      });
    } finally {
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
      }
    }
  };

  return { profileState, saveState, updateField, submit };
}
