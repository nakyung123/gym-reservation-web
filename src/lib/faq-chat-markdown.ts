// FAQ 안내봇 답변의 최소 마크다운 파서.
//
// 모델은 볼드(**)와 불릿(-)을 섞어 답한다. 위젯이 평문으로 렌더링하면 별표가 그대로
// 보이므로(실제로 그렇게 보였다) 여기서 블록 구조로 바꾼 뒤 React가 텍스트로 렌더링한다.
//
// 라이브러리를 쓰지 않는 이유: 지원할 문법이 볼드·불릿 둘뿐이고, 마크다운 렌더러를 붙이면
// HTML 주입 경로(dangerouslySetInnerHTML)가 생긴다. 여기서는 문자열만 돌려주고 렌더링은
// React가 하므로 이스케이프가 기본으로 보장된다.
//
// 프롬프트로 "마크다운을 쓰지 말라"고 지시하는 방법도 있으나, 모델이 가끔 어기면 다시
// 깨진다. 렌더러에서 처리하면 모델 출력과 무관하게 항상 정상으로 보인다.

export type InlineSpan = {
  text: string;
  bold: boolean;
};

export type ChatBlock =
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; items: InlineSpan[][] };

const BULLET_RE = /^\s*[-*]\s+(.*)$/;

// `**...**`를 볼드 span으로 분리한다.
//
// 스트리밍 중에는 여는 `**`만 도착한 상태가 존재한다. 이때 닫히지 않은 구간을 평문으로
// 두면 별표가 잠깐 보였다 사라져 깜빡인다. 그래서 닫히지 않으면 끝까지 볼드로 처리한다
// (토큰이 더 오면 자연스럽게 확정된다).
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = text;

  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) {
      spans.push({ text: rest, bold: false });
      break;
    }

    if (open > 0) {
      spans.push({ text: rest.slice(0, open), bold: false });
    }

    const afterOpen = rest.slice(open + 2);
    const close = afterOpen.indexOf("**");

    if (close === -1) {
      // 닫히지 않음(스트리밍 중) — 남은 전부를 볼드로.
      if (afterOpen.length > 0) {
        spans.push({ text: afterOpen, bold: true });
      }
      break;
    }

    const bold = afterOpen.slice(0, close);
    if (bold.length > 0) {
      spans.push({ text: bold, bold: true });
    }
    rest = afterOpen.slice(close + 2);
  }

  return spans.filter((span) => span.text.length > 0);
}

// 줄 단위로 블록을 만든다. 연속된 불릿 줄은 하나의 list로 묶는다.
// 빈 줄은 문단 구분자로만 쓰고 블록으로 만들지 않는다(버블 안에서 빈 문단은 공백만 낭비).
export function parseChatMarkdown(content: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let listItems: InlineSpan[][] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  };

  for (const line of content.split("\n")) {
    const bullet = BULLET_RE.exec(line);

    if (bullet) {
      listItems.push(parseInline(bullet[1]));
      continue;
    }

    flushList();

    if (line.trim().length === 0) {
      continue;
    }
    blocks.push({ type: "paragraph", spans: parseInline(line) });
  }

  flushList();
  return blocks;
}
