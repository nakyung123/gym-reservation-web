import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FAQ_KNOWLEDGE } from "@/lib/server/faq-knowledge";

// 문의·FAQ = FAQ 지식 SSOT(faq-knowledge.ts)를 카테고리별로 보여준다.
// 같은 사실을 두 곳에 쓰지 않으려고 FAQ 봇과 동일한 출처를 재사용한다(취소 시한 등 SSOT 단일).
// 토글은 JS 없이 네이티브 <details>/<summary>로 처리(서버 컴포넌트 + 기본 a11y).
// 기존 '이용 안내(guide)'에 있던 FAQ 아코디언을 이 라우트로 이전했다. guide는 이용 방법 단계 안내로 교체.

export const metadata: Metadata = {
  title: "문의·FAQ — 공공체육관 예약",
  description: "가입·예약·취소·이용 방법 등 자주 묻는 질문을 안내합니다.",
};

export default async function FaqPage() {
  const t = await getTranslations("Faq");
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{t("intro")}</p>

      <div className="mt-8 space-y-8">
        {FAQ_KNOWLEDGE.map((category) => (
          <section key={category.title}>
            <h2 className="text-[17px] font-bold text-foreground">
              {category.title}
            </h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {category.entries.map((entry) => (
                <li key={entry.q}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-semibold text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2">
                      <span>{entry.q}</span>
                      <span
                        className="text-subtle transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      >
                        ⌄
                      </span>
                    </summary>
                    <p className="whitespace-pre-line px-4 pb-4 text-[14.5px] leading-relaxed text-muted">
                      {entry.a}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-muted">
        {t("contact")}
      </p>
    </main>
  );
}
