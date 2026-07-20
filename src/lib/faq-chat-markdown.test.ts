import { describe, expect, it } from "vitest";
import { parseChatMarkdown, parseInline } from "@/lib/faq-chat-markdown";

describe("parseInline", () => {
  it("볼드 구간을 분리한다", () => {
    expect(parseInline("**일시**: 7월 31일")).toEqual([
      { text: "일시", bold: true },
      { text: ": 7월 31일", bold: false },
    ]);
  });

  it("볼드가 없으면 평문 한 덩어리로 둔다", () => {
    expect(parseInline("예약 내역입니다")).toEqual([
      { text: "예약 내역입니다", bold: false },
    ]);
  });

  it("한 줄에 볼드가 여러 개여도 각각 분리한다", () => {
    expect(parseInline("**A** 와 **B**")).toEqual([
      { text: "A", bold: true },
      { text: " 와 ", bold: false },
      { text: "B", bold: true },
    ]);
  });

  // 스트리밍 중에는 여는 ** 만 도착한 상태가 실제로 존재한다.
  // 이때 별표가 그대로 보이면 깜빡이므로 끝까지 볼드로 처리한다.
  it("닫히지 않은 볼드는 끝까지 볼드로 처리한다", () => {
    expect(parseInline("**일시")).toEqual([{ text: "일시", bold: true }]);
  });

  it("빈 문자열은 빈 배열", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseChatMarkdown", () => {
  it("연속된 불릿 줄을 하나의 list로 묶는다", () => {
    const blocks = parseChatMarkdown("- 첫째\n- 둘째");

    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          [{ text: "첫째", bold: false }],
          [{ text: "둘째", bold: false }],
        ],
      },
    ]);
  });

  it("문단과 불릿이 섞이면 블록을 나눈다", () => {
    const blocks = parseChatMarkdown("현재 예약 내역입니다:\n- **시설**: 체육관");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      spans: [{ text: "현재 예약 내역입니다:", bold: false }],
    });
    expect(blocks[1]).toEqual({
      type: "list",
      items: [
        [
          { text: "시설", bold: true },
          { text: ": 체육관", bold: false },
        ],
      ],
    });
  });

  it("빈 줄은 블록을 만들지 않는다", () => {
    const blocks = parseChatMarkdown("첫 문단\n\n둘째 문단");

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.type === "paragraph")).toBe(true);
  });

  it("불릿 사이에 빈 줄이 있으면 별도 list로 나뉜다", () => {
    const blocks = parseChatMarkdown("- 첫째\n\n- 둘째");

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("list");
    expect(blocks[1].type).toBe("list");
  });

  it("* 불릿도 인식한다", () => {
    const blocks = parseChatMarkdown("* 별표 불릿");

    expect(blocks[0]).toEqual({
      type: "list",
      items: [[{ text: "별표 불릿", bold: false }]],
    });
  });

  // 실제로 화면에 별표가 그대로 보였던 답변 형태를 그대로 넣어 회귀를 막는다.
  it("실제 답변 형태에서 별표가 남지 않는다", () => {
    const answer = [
      "현재 예약 내역은 다음과 같습니다:",
      "",
      "- **일시**: 2026년 7월 31일 오후 9시 (21:00)",
      "- **시설**: 일자산제1체육관",
      "- **상태**: 예약 확정",
    ].join("\n");

    const blocks = parseChatMarkdown(answer);
    const allText = blocks
      .flatMap((block) =>
        block.type === "list" ? block.items.flat() : block.spans,
      )
      .map((span) => span.text)
      .join("");

    expect(allText).not.toContain("*");
  });
});
