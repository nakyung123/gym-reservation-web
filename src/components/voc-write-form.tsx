"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SelectMenu } from "@/components/select-menu";
import { createVocPost } from "@/lib/voc-client";
import { formatPhone } from "@/lib/input-format";
import { VOC_CATEGORIES, VOC_CATEGORY_LABELS } from "@/lib/domain-constants";
import type { Gym, VocCategory } from "@/types/domain";

// 공개 문의 게시판 글쓰기 폼(KMI 고객의 소리 글쓰기 화면 기반). 로그인 없이 익명 작성.
// 리치 에디터는 범위상 큰 textarea로 대체한다. 제목은 별도로 받지 않고 분류를 제목으로 쓴다.
// 셀렉트(카테고리·체육관·이메일 도메인)는 시설 찾기 검색바와 동일한 SelectMenu로 통일한다.

const FIELD_CLASS =
  "h-[56px] rounded-md border border-line-strong bg-white px-3.5 text-[16px] text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-slate-100";
// SelectMenu 트리거 룩(높이·보더·패딩은 입력칸과 동일, 화살표·목록은 SelectMenu 공통).
const SELECT_TRIGGER_CLASS =
  "h-[56px] rounded-md border border-line-strong bg-white px-3.5 text-[16px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-slate-100";
const LABEL_CLASS = "text-[16px] font-semibold text-slate-800";

// 이메일 도메인 빠른 선택.
const EMAIL_DOMAINS = ["naver.com", "gmail.com", "daum.net", "hanmail.net"];

export function VocWriteForm({ gyms }: { gyms: Gym[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<VocCategory>("inquiry");
  const [authorName, setAuthorName] = useState("");
  const [gymId, setGymId] = useState("");
  const [phone, setPhone] = useState("");
  const [emailLocal, setEmailLocal] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [domainSelect, setDomainSelect] = useState("direct");
  const [body, setBody] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<
    { kind: "form" } | { kind: "submitting" } | { kind: "error"; message: string }
  >({ kind: "form" });

  const emailComplete =
    emailLocal.trim().length > 0 && emailDomain.trim().length > 0;

  const canSubmit =
    authorName.trim().length > 0 &&
    gymId.length > 0 &&
    phone.trim().length > 0 &&
    emailComplete &&
    body.trim().length > 0 &&
    /^\d{4}$/.test(password) &&
    agreed &&
    state.kind !== "submitting";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      if (!agreed) {
        setState({ kind: "error", message: "개인정보 수집 및 이용에 동의해 주세요." });
      }
      return;
    }
    setState({ kind: "submitting" });
    const email = `${emailLocal.trim()}@${emailDomain.trim()}`;
    const result = await createVocPost({
      category,
      gymId: gymId || null,
      authorName,
      phone,
      email,
      body,
      password,
    });
    if (result.ok) {
      router.push("/faq?cat=support");
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  const disabled = state.kind === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto mt-8 w-full max-w-[1368px]"
    >
      <p className="mb-2 text-right text-[14px] text-slate-900">
        <span className="text-error">*</span> 필수입력값
      </p>

      {/* 카테고리 */}
      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASS}>
          카테고리 <span className="text-error">*</span>
        </span>
        <SelectMenu
          value={category}
          options={VOC_CATEGORIES.map((value) => ({
            value,
            label: VOC_CATEGORY_LABELS[value],
          }))}
          placeholder="카테고리를 선택해주세요"
          ariaLabel="카테고리"
          disabled={disabled}
          onChange={(value) => setCategory(value as VocCategory)}
          triggerClassName={SELECT_TRIGGER_CLASS}
        />
      </div>

      {/* 성명 / 센터 */}
      <div className="mt-6 grid grid-cols-1 gap-7 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="voc-name" className={LABEL_CLASS}>
            성명 <span className="text-error">*</span>
          </label>
          <input
            id="voc-name"
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={50}
            placeholder="홍길동"
            disabled={disabled}
            className={`${FIELD_CLASS} w-full`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>
            체육관 <span className="text-error">*</span>
          </span>
          <SelectMenu
            value={gymId}
            options={gyms.map((gym) => ({ value: gym.id, label: gym.name }))}
            placeholder="체육관을 선택해주세요"
            placeholderClassName="text-slate-950"
            ariaLabel="체육관"
            disabled={disabled}
            onChange={setGymId}
            triggerClassName={SELECT_TRIGGER_CLASS}
          />
        </div>
      </div>

      {/* 연락처 / 이메일 */}
      <div className="mt-6 grid grid-cols-1 gap-7 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="voc-phone" className={LABEL_CLASS}>
            연락처 <span className="text-error">*</span>
          </label>
          <input
            id="voc-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            maxLength={13}
            placeholder="010-0000-0000"
            disabled={disabled}
            className={`${FIELD_CLASS} w-full`}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>
            이메일 <span className="text-error">*</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={emailLocal}
              onChange={(e) => setEmailLocal(e.target.value)}
              placeholder="abcd"
              aria-label="이메일 아이디"
              disabled={disabled}
              className={`${FIELD_CLASS} w-[209.58px] max-w-full flex-1`}
            />
            <span aria-hidden="true" className="text-[16px] text-slate-900">
              @
            </span>
            <input
              type="text"
              value={emailDomain}
              onChange={(e) => setEmailDomain(e.target.value)}
              placeholder="naver.com"
              aria-label="이메일 도메인"
              disabled={disabled || domainSelect !== "direct"}
              className={`${FIELD_CLASS} w-[209.59px] max-w-full flex-1`}
            />
            <div className="w-[215px] max-w-full shrink-0">
              <SelectMenu
                value={domainSelect}
                options={[
                  { value: "direct", label: "직접입력" },
                  ...EMAIL_DOMAINS.map((domain) => ({
                    value: domain,
                    label: domain,
                  })),
                ]}
                placeholder="직접입력"
                ariaLabel="이메일 도메인 선택"
                disabled={disabled}
                onChange={(next) => {
                  setDomainSelect(next);
                  setEmailDomain(next === "direct" ? "" : next);
                }}
                triggerClassName={SELECT_TRIGGER_CLASS}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 내용 */}
      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="voc-body" className={LABEL_CLASS}>
          내용 <span className="text-error">*</span>
        </label>
        <textarea
          id="voc-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          placeholder="내용을 입력해주세요."
          disabled={disabled}
          className="min-h-[420px] w-full resize-none rounded-md border border-line-strong bg-white p-6 text-[16px] leading-relaxed text-slate-950 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      {/* 임시 비밀번호 */}
      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="voc-password" className={LABEL_CLASS}>
          임시 비밀번호 <span className="text-error">*</span>
        </label>
        <input
          id="voc-password"
          type="password"
          inputMode="numeric"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          maxLength={4}
          placeholder="숫자 4자리 입력해주세요"
          disabled={disabled}
          className={`${FIELD_CLASS} w-full`}
        />
      </div>

      {/* 개인정보 수집 및 이용 */}
      <div className="mt-8 flex flex-col gap-3">
        <p className="text-[18px] font-bold text-slate-800">
          개인정보 수집 및 이용에 대한 동의
        </p>
        <div className="min-h-[156px] rounded-md border border-line-strong bg-white p-5 text-[16px] leading-relaxed text-slate-900">
          <p>· 목적 : 문의 접수 및 처리 결과 안내</p>
          <p>· 수집항목 : 분류, 성명, 체육관, 연락처, 이메일, 문의 내용</p>
          <p>· 보유기간 : 3년(소비자 불만 또는 분쟁처리에 관한 기록)</p>
          <p className="mt-3">
            귀하는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다.
          </p>
          <p>다만 비동의 시에는 문의 등록 서비스 이용이 불가합니다.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[18px] font-bold text-slate-800">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={disabled}
            className="size-5 accent-accent"
          />
          개인정보 수집 및 이용에 대해 동의합니다.
        </label>
      </div>

      {state.kind === "error" ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
        >
          {state.message}
        </p>
      ) : null}

      {/* 취소 / 등록 */}
      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/faq?cat=support")}
          disabled={disabled}
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-[30px] border border-line-strong bg-white text-[18px] font-medium text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-[40px] w-[100px] items-center justify-center rounded-[30px] bg-accent text-[18px] font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {disabled ? "등록 중…" : "등록"}
        </button>
      </div>
    </form>
  );
}
