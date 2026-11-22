"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/ui/app-button";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  confirmPayment,
  failPayment,
  popPendingOrder,
} from "@/lib/payment-client";

// 토스 결제창이 돌려보내는 두 화면.
// - 성공(successUrl): 쿼리의 paymentKey·orderId·amount로 서버 승인을 요청하고, 확정되면 예약 상세로 이동한다.
// - 실패(failUrl): 결제를 닫고 선점한 정원을 돌려준 뒤 사유를 보여 준다.
// 두 요청 모두 서버에서 같은 요청 반복이 안전하므로, 실패하면 다시 시도 버튼을 둔다.

type ViewState =
  | { kind: "working" }
  | { kind: "processing"; message: string }
  // manualRefund: 돈은 나갔는데 자동 환불이 실패해 사람이 환불해야 한다. 예약이 없으므로 고객센터 안내만 보인다.
  | { kind: "error"; message: string; retryable: boolean; manualRefund?: boolean }
  | { kind: "done"; message: string };

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function ResultBox({
  title,
  state,
  workingLabel,
  children,
}: {
  title: string;
  state: ViewState;
  workingLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-[720px] max-w-full py-[60px]">
      <h1 className="text-center text-[28px] font-bold text-slate-900 sm:text-[36px]">
        {title}
      </h1>
      <div className="mx-auto mt-8 flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl bg-white p-8 text-center">
        {state.kind === "working" ? (
          <p className="text-[16px] font-semibold text-slate-500" role="status">
            {workingLabel}
          </p>
        ) : (
          <p
            className={`text-[16px] font-semibold ${
              state.kind === "error" ? "text-error" : "text-slate-700"
            }`}
            role={state.kind === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

// 쿼리의 amount는 양의 정수 문자열이어야 한다. 비어 있으면 Number("")·Number(null)이 0이 되어 정수 검사를
// 통과하므로, 문자열 형식으로 먼저 거른다. 잘못된 값으로 승인을 보내면 서버가 금액 불일치로 결제를 닫는다.
function parseAmountParam(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function PaymentSuccessView() {
  const t = useTranslations("Payment");
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useRequireAuth({ from: currentPath() });
  const [state, setState] = useState<ViewState>({ kind: "working" });
  const [attempt, setAttempt] = useState(0);
  const startedAttempt = useRef<number | null>(null);

  const paymentKey = searchParams.get("paymentKey") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const amount = parseAmountParam(searchParams.get("amount"));
  const paramsValid = paymentKey.length > 0 && orderId.length > 0 && amount !== null;

  useEffect(() => {
    if (!session.ok || !paramsValid || amount === null) return;
    // StrictMode 이중 실행과 재렌더에서 같은 시도를 두 번 보내지 않는다.
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;

    void confirmPayment({ paymentKey, orderId, amount }).then((result) => {
      if (result.ok) {
        popPendingOrder();
        router.replace(`/reservations/${encodeURIComponent(result.reservation.id)}/detail`);
        return;
      }
      if (result.kind === "processing") {
        setState({ kind: "processing", message: result.message });
        return;
      }
      setState({
        kind: "error",
        message: result.message,
        // 서버 판단이 끝난 거절(4xx)은 다시 보내도 같다. 연결 실패·5xx만 다시 시도를 권한다.
        retryable: result.status === undefined || result.status >= 500,
        manualRefund: result.code === "manual-refund-required",
      });
    });
  }, [session.ok, paramsValid, paymentKey, orderId, amount, attempt, router]);

  const shownState: ViewState = paramsValid
    ? state
    : { kind: "error", message: t("invalidResult"), retryable: false };

  return (
    <ResultBox title={t("successTitle")} state={shownState} workingLabel={t("confirming")}>
      {shownState.kind !== "working" ? (
        <div className="flex flex-wrap justify-center gap-3">
          {/* 처리 중: 서버는 1분 넘게 멈춘 승인을 다시 확인 요청 때 바로 정리한다(같은 요청 반복이 안전). */}
          {shownState.kind === "processing" ||
          (shownState.kind === "error" && shownState.retryable) ? (
            <Button
              size="lg"
              onClick={() => {
                setState({ kind: "working" });
                setAttempt((value) => value + 1);
              }}
            >
              {shownState.kind === "processing" ? t("checkAgain") : t("retry")}
            </Button>
          ) : null}
          {shownState.kind === "error" && shownState.manualRefund ? null : (
            <ButtonLink href="/reservations" variant="outline" size="lg">
              {t("goReservations")}
            </ButtonLink>
          )}
        </div>
      ) : null}
    </ResultBox>
  );
}

export function PaymentFailView() {
  const t = useTranslations("Payment");
  const searchParams = useSearchParams();
  const session = useRequireAuth({ from: currentPath() });
  const [state, setState] = useState<ViewState>({ kind: "working" });
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const started = useRef(false);

  // URL의 message는 표시하지 않는다. 누구나 링크를 만들어 우리 화면에 원하는 문구를 띄울 수 있다.
  // code도 URL 값이므로 형식(영문 대문자·숫자·_, 64자 이하)이 맞을 때만 쓴다.
  const rawCode = searchParams.get("code") ?? "";
  const code = /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : "UNKNOWN";
  const canceled = code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL";

  useEffect(() => {
    if (!session.ok || started.current) return;
    started.current = true;

    // 사용자가 창을 닫은 경우 토스가 orderId를 붙이지 않는다. 떠나기 전에 남겨 둔 값을 쓴다.
    const pending = popPendingOrder();
    const orderId = searchParams.get("orderId") ?? pending?.orderId ?? null;
    const reason = canceled
      ? t("canceledMessage")
      : t("failedMessage", { code });

    // orderId를 모르면 서버에 닫을 결제가 없다. 선점은 15분 뒤 만료 정리로 풀린다.
    const closing = orderId
      ? failPayment({ orderId, code })
      : Promise.resolve({ ok: true } as const);
    void closing.then((result) => {
      setReturnPath(pending?.returnPath ?? null);
      setState(
        result.ok
          ? { kind: "done", message: reason }
          : { kind: "error", message: `${reason} ${result.message}`, retryable: false },
      );
    });
  }, [session.ok, searchParams, canceled, code, t]);

  return (
    <ResultBox
      title={canceled ? t("canceledTitle") : t("failedTitle")}
      state={state}
      workingLabel={t("closing")}
    >
      {state.kind !== "working" ? (
        <div className="flex flex-wrap justify-center gap-3">
          {returnPath ? (
            <ButtonLink href={returnPath} size="lg">
              {t("retryReservation")}
            </ButtonLink>
          ) : null}
          <ButtonLink href="/gyms" variant="outline" size="lg">
            {t("goGyms")}
          </ButtonLink>
        </div>
      ) : null}
    </ResultBox>
  );
}
