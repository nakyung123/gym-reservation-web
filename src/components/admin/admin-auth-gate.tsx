"use client";

import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { signOut } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase-client";
import { signInWithEmail } from "@/lib/firebase-email-auth";
import { signInWithLoginId } from "@/lib/firebase-login-id-auth";
import { useAdminSession } from "@/hooks/use-admin-session";
import { AdminButtonSpinner } from "@/components/admin/admin-async-state";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
} from "@/components/admin/admin-ui";
import { Button, ButtonLink } from "@/components/ui/app-button";

/**
 * 관리자 콘솔 진입 게이트.
 *
 * /admin은 이미 proxy.ts의 Basic Auth로 1차 잠금이 걸려 있지만, 관리자 API는 그와 별개로
 * Firebase ID token + `admin` 클레임을 요구한다. Basic Auth만 통과한 상태에서는 화면은 떠도
 * 모든 API가 401이 되고, 예전에는 로그인하러 갈 방법조차 없었다(막다른 길).
 *
 * 그래서 세 상태를 명시적으로 나눈다.
 *  - signed-out : 이 자리에서 바로 로그인(사이트를 떠나지 않는다)
 *  - not-admin  : 로그인은 됐지만 권한이 없음을 분명히 알리고 계정 전환 경로를 준다
 *  - admin      : 콘솔 본문(children)을 렌더
 *
 * 권한 판단의 SSOT는 서버(`/api/admin/*`의 verifyIdToken + claim 검증)다. 이 게이트는 화면 분기만 한다.
 */
/**
 * 통과한 관리자의 이메일. 콘솔 셸(상단바 계정 표시)이 읽는다.
 * 게이트가 이미 세션을 구독하고 있으므로, 셸이 훅을 다시 붙여 토큰을 또 갱신하지 않게 한다.
 */
const AdminEmailContext = createContext<string | null>(null);

export function useAdminEmail(): string | null {
  return useContext(AdminEmailContext);
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { state, refresh } = useAdminSession();

  if (state.status === "checking") {
    return (
      <GateFrame>
        <p
          className="flex items-center justify-center gap-3 text-[15px] font-semibold text-muted"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
            aria-hidden="true"
          />
          관리자 권한을 확인하는 중입니다.
        </p>
      </GateFrame>
    );
  }

  if (state.status === "signed-out") {
    return (
      <GateFrame>
        <AdminLoginForm onSignedIn={refresh} />
      </GateFrame>
    );
  }

  if (state.status === "not-admin") {
    return (
      <GateFrame>
        <NotAdminNotice email={state.email} onSignedOut={refresh} />
      </GateFrame>
    );
  }

  return (
    <AdminEmailContext.Provider value={state.email}>
      {children}
    </AdminEmailContext.Provider>
  );
}

// 게이트 화면의 공통 틀. 사이드바 없이 캔버스 가운데 카드 하나만 둔다(관리자 로그인 관례).
function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 px-5 py-16">
      <section className="w-full max-w-100 rounded-2xl border border-line bg-white p-7 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-[13px] font-bold text-accent-ink">
            체
          </span>
          <span className="text-[15px] font-bold text-foreground">
            운영 콘솔
          </span>
        </div>
        <h1 className="mt-5 text-[22px] font-bold text-foreground">
          관리자 로그인
        </h1>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

function AdminLoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "signing-in" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = identifier.trim();
    if (trimmed.length === 0 || password.length === 0) return;
    if (state.kind === "signing-in") return;

    setState({ kind: "signing-in" });
    // 고객 로그인과 동일한 규칙: '@'가 있으면 이메일, 없으면 로그인 아이디로 처리한다.
    const result = trimmed.includes("@")
      ? await signInWithEmail({ email: trimmed, password })
      : await signInWithLoginId({ loginId: trimmed, password });

    if (result.ok) {
      // 로그인 성공. 클레임을 다시 읽어 admin 여부를 판정한다(권한 없으면 not-admin 화면).
      onSignedIn();
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  const isSigningIn = state.kind === "signing-in";

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-[15px] leading-relaxed text-muted">
        관리자 권한이 부여된 계정으로 로그인해 주세요.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-identifier" className={ADMIN_FIELD_LABEL_CLASS}>
          아이디 또는 이메일
        </label>
        <input
          id="admin-identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(event) => {
            setIdentifier(event.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          disabled={isSigningIn}
          className={`${ADMIN_CONTROL_CLASS} placeholder:text-subtle`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className={ADMIN_FIELD_LABEL_CLASS}>
          비밀번호
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          disabled={isSigningIn}
          className={ADMIN_CONTROL_CLASS}
        />
      </div>

      {state.kind === "error" ? (
        <AdminErrorNotice message={state.message} />
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={
          isSigningIn || identifier.trim().length === 0 || password.length === 0
        }
        className="mt-1 w-full"
      >
        {isSigningIn ? (
          <>
            <AdminButtonSpinner />
            로그인 중
          </>
        ) : (
          "로그인"
        )}
      </Button>
    </form>
  );
}

function NotAdminNotice({
  email,
  onSignedOut,
}: {
  email: string | null;
  onSignedOut: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const { auth } = getFirebaseClient();
    try {
      await signOut(auth);
    } finally {
      // signOut이 실패해도 게이트를 다시 평가한다(세션이 남아 있으면 이 화면이 다시 뜬다).
      setSigningOut(false);
      onSignedOut();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminErrorNotice message="이 계정에는 관리자 권한이 없습니다." />
      <p className="text-[15px] leading-relaxed text-muted">
        {email ? `${email} 계정으로 로그인되어 있습니다. ` : ""}
        관리자 권한이 부여된 계정으로 다시 로그인해 주세요.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="lg" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? (
            <>
              <AdminButtonSpinner />
              로그아웃 중
            </>
          ) : (
            "다른 계정으로 로그인"
          )}
        </Button>
        <ButtonLink href="/" variant="outline" size="lg">
          홈으로
        </ButtonLink>
      </div>
    </div>
  );
}
