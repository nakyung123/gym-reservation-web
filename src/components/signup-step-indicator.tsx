"use client";

// 회원가입 4단계 진행 인디케이터. 약관 동의·정보 입력 단계 상단에 노출한다.
// current 인덱스 기준: 이전 단계는 완료(진한 회색), 현재는 강조(파랑), 이후는 대기(연한 회색).

type StepDef = {
  label: string;
  icon: (props: { className: string }) => React.ReactNode;
};

const STEPS: StepDef[] = [
  {
    label: "본인 인증",
    icon: ({ className }) => (
      <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
  {
    label: "약관 동의",
    icon: ({ className }) => (
      <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4h6v3H9z" />
        <path d="m9 13 2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "정보 입력",
    icon: ({ className }) => (
      <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h8l5 5v13a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    label: "가입 완료",
    icon: ({ className }) => (
      <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </svg>
    ),
  },
];

export function SignupStepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-between">
      {STEPS.map((step, index) => {
        const isActive = index === current;
        const isDone = index < current;
        const tone = isActive
          ? "text-[#3b82f6]"
          : isDone
            ? "text-[#252525]"
            : "text-[#c9c9c9]";
        return (
          <div key={step.label} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center gap-2">
              {step.icon({ className: tone })}
              <span className={`text-[15px] font-medium ${tone}`}>{step.label}</span>
            </div>
            {index < STEPS.length - 1 ? (
              <svg
                className="mt-3 shrink-0 text-[#d0d0d0]"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
