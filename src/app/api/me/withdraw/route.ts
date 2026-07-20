import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  DEMO_ACCOUNT_BLOCKED_MESSAGE,
  isDemoUser,
} from "@/lib/server/demo-account";
import { withdrawAccount } from "@/lib/server/withdrawal-service";
import { validateWithdrawalInput } from "@/lib/withdrawal";

export const dynamic = "force-dynamic";

// POST /api/me/withdraw
// 회원 탈퇴 처리. 진행 중 예약이 있으면 409, 그 외 오류는 500. 성공 시 200.
export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  // 공개 데모 계정은 탈퇴시키지 않는다. 삭제되면 복구가 불가능해 데모 링크가 죽는다.
  if (isDemoUser(auth.uid)) {
    return Response.json(
      { message: DEMO_ACCOUNT_BLOCKED_MESSAGE, reason: "demo-account" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateWithdrawalInput(body);
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const result = await withdrawAccount(auth.uid, validation.input);
  if (!result.ok) {
    if (result.reason === "active-reservation") {
      return Response.json(
        { message: result.message, reason: result.reason },
        { status: 409 },
      );
    }
    if (result.reason === "auth-delete-failed") {
      // DB는 정리됐지만 Auth user 삭제가 실패한 부분 완료 상태. 502로 응답해 클라이언트가
      // 재시도하도록 안내한다. 재시도는 DB noop + Auth delete만 재호출되는 형태로 안전하다.
      return Response.json(
        { message: result.message, reason: result.reason },
        { status: 502 },
      );
    }
    return Response.json({ message: result.message }, { status: 500 });
  }

  return Response.json({ message: "회원 탈퇴가 완료되었습니다." });
}
