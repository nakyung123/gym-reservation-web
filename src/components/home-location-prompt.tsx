"use client";

import { useEffect } from "react";
import { useUserLocation } from "@/hooks/use-user-location";

// 메인 페이지 진입 시 한 번만 권한 모달을 띄운다.
// - permission 상태가 "prompt"이거나 "denied"인 경우 모달 노출
// - 사용자가 이미 허용한 상태(granted) 또는 unknown(검사 중)이면 띄우지 않음
// - 세션 내 중복 방지를 위해 sessionStorage에 마커를 둔다.

const SESSION_KEY = "gym:location-prompted-on-home";

export function HomeLocationPrompt() {
  const { permission, isPromptModalOpen, openPromptModal } = useUserLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (permission === "unknown" || permission === "granted") return;
    if (isPromptModalOpen) return;
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    openPromptModal();
  }, [permission, isPromptModalOpen, openPromptModal]);

  return null;
}
