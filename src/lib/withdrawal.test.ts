import { describe, expect, it } from "vitest";
import { validateWithdrawalInput, WITHDRAWAL_CATEGORIES } from "@/lib/withdrawal";

describe("validateWithdrawalInput", () => {
  it("정상 카테고리 + detail null을 통과시킨다", () => {
    expect(
      validateWithdrawalInput({ category: WITHDRAWAL_CATEGORIES[0], detail: null }),
    ).toEqual({
      ok: true,
      input: { category: WITHDRAWAL_CATEGORIES[0], detail: null },
    });
  });

  it("detail이 undefined여도 null로 정리한다", () => {
    expect(
      validateWithdrawalInput({ category: WITHDRAWAL_CATEGORIES[1] }),
    ).toEqual({
      ok: true,
      input: { category: WITHDRAWAL_CATEGORIES[1], detail: null },
    });
  });

  it("detail을 trim해서 저장한다", () => {
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[2],
        detail: "  공유하기 어려운 사정  ",
      }),
    ).toEqual({
      ok: true,
      input: {
        category: WITHDRAWAL_CATEGORIES[2],
        detail: "공유하기 어려운 사정",
      },
    });
  });

  it("detail이 빈 문자열이면 null로 정리한다", () => {
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[3],
        detail: "   ",
      }),
    ).toEqual({
      ok: true,
      input: { category: WITHDRAWAL_CATEGORIES[3], detail: null },
    });
  });

  it("객체가 아니면 거부한다", () => {
    expect(validateWithdrawalInput(null)).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
    expect(validateWithdrawalInput("foo")).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
    expect(validateWithdrawalInput([])).toEqual({
      ok: false,
      message: "요청 본문이 올바르지 않습니다.",
    });
  });

  it("category가 없거나 알 수 없는 값이면 거부한다", () => {
    expect(validateWithdrawalInput({})).toEqual({
      ok: false,
      message: "탈퇴 사유를 선택해 주세요.",
    });
    expect(
      validateWithdrawalInput({ category: "기타이유", detail: null }),
    ).toEqual({
      ok: false,
      message: "탈퇴 사유를 선택해 주세요.",
    });
  });

  it("detail이 문자열도 null도 아니면 거부한다", () => {
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[0],
        detail: 123,
      }),
    ).toEqual({
      ok: false,
      message: "상세 사유는 문자열이어야 합니다.",
    });
  });

  it("detail이 300자(코드포인트)를 초과하면 거부한다", () => {
    const detail = "가".repeat(301);
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[0],
        detail,
      }),
    ).toEqual({
      ok: false,
      message: "상세 사유는 300자 이하로 입력해 주세요.",
    });
  });

  it("detail이 정확히 300자면 통과시킨다", () => {
    const detail = "가".repeat(300);
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[0],
        detail,
      }),
    ).toEqual({
      ok: true,
      input: { category: WITHDRAWAL_CATEGORIES[0], detail },
    });
  });

  it("이모지가 포함된 300자도 정확히 코드포인트로 검증한다", () => {
    // String.length는 surrogate pair 2로 세지만 [...str].length는 1로 센다.
    // validateWithdrawalInput은 후자를 사용하므로 코드포인트 기준.
    const detail = "🙂".repeat(300);
    expect(
      validateWithdrawalInput({
        category: WITHDRAWAL_CATEGORIES[0],
        detail,
      }),
    ).toEqual({
      ok: true,
      input: { category: WITHDRAWAL_CATEGORIES[0], detail },
    });
  });
});
