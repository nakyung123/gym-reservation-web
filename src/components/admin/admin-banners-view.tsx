"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  createBannerRequest,
  deleteBannerRequest,
  fetchBanners,
  updateBannerRequest,
} from "@/lib/admin/admin-banner-client";
import type { Banner, BannerMetaInput } from "@/lib/admin/banner";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  AdminButtonSpinner,
  AdminEmptyState,
  AdminLoadingRow,
} from "@/components/admin/admin-async-state";

type ListState =
  | { status: "loading" }
  | { status: "ready"; banners: Banner[] }
  | { status: "error"; message: string };

type FormState = {
  title: string;
  linkUrl: string;
  sortOrder: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  linkUrl: "",
  sortOrder: "0",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

// ISO 문자열 → datetime-local 입력값(YYYY-MM-DDTHH:mm, 로컬 시각). 비면 빈 문자열.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// datetime-local 입력값 → ISO 문자열. 비면 null.
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formToMeta(form: FormState): BannerMetaInput {
  const title = form.title.trim();
  const linkUrl = form.linkUrl.trim();
  const sortOrder = Number(form.sortOrder);
  return {
    title: title.length > 0 ? title : null,
    linkUrl: linkUrl.length > 0 ? linkUrl : null,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    isActive: form.isActive,
    startsAt: localInputToIso(form.startsAt),
    endsAt: localInputToIso(form.endsAt),
  };
}

function bannerToForm(banner: Banner): FormState {
  return {
    title: banner.title ?? "",
    linkUrl: banner.linkUrl ?? "",
    sortOrder: String(banner.sortOrder),
    isActive: banner.isActive,
    startsAt: isoToLocalInput(banner.startsAt),
    endsAt: isoToLocalInput(banner.endsAt),
  };
}

export function AdminBannersView() {
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  // mode: null=생성, 문자열=해당 id 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setListState({ status: "loading" });
        try {
          const result = await fetchBanners(controller.signal);
          if (controller.signal.aborted) return;
          if (result.ok) {
            setListState({ status: "ready", banners: result.banners });
          } else {
            setListState({ status: "error", message: result.message });
          }
        } catch {
          // AbortError 무시
        }
      })();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [reloadKey]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setFormError(null);
  }, []);

  const startEdit = useCallback((banner: Banner) => {
    setEditingId(banner.id);
    setForm(bannerToForm(banner));
    setImageFile(null);
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    const meta = formToMeta(form);

    if (!editingId && !imageFile) {
      setFormError("배너 이미지를 선택해 주세요.");
      return;
    }
    if (meta.startsAt && meta.endsAt && meta.startsAt > meta.endsAt) {
      setFormError("시작 시각은 종료 시각보다 이후일 수 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const result = editingId
        ? await updateBannerRequest(editingId, meta, imageFile)
        : await createBannerRequest(meta, imageFile as File);
      if (result.ok) {
        resetForm();
        reload();
      } else {
        setFormError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [editingId, form, imageFile, reload, resetForm]);

  const handleToggleActive = useCallback(
    async (banner: Banner) => {
      setPendingId(banner.id);
      try {
        const meta = formToMeta({
          ...bannerToForm(banner),
          isActive: !banner.isActive,
        } as FormState);
        const result = await updateBannerRequest(banner.id, meta, null);
        if (result.ok) reload();
      } finally {
        setPendingId(null);
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (banner: Banner) => {
      setPendingId(banner.id);
      try {
        const result = await deleteBannerRequest(banner.id);
        if (result.ok) {
          if (editingId === banner.id) resetForm();
          reload();
        }
      } finally {
        setPendingId(null);
      }
    },
    [editingId, reload, resetForm],
  );

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="text-xs font-semibold text-accent-strong hover:underline"
          >
            ← 운영 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-950">배너 관리</h1>
          <p className="text-sm text-slate-600">
            홈에 노출되는 운영 배너를 등록·교체합니다. 이미지는 외부 스토리지에
            저장되고, 노출 조건(활성·기간·순서)으로 제어합니다.
          </p>
        </header>

        {/* 생성/수정 폼 */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-4 rounded-lg border border-line bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950">
              {editingId ? "배너 수정" : "새 배너 등록"}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:underline"
              >
                새 배너로 전환
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
              이미지 {editingId ? "(변경 시에만 선택)" : "(필수)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] ?? null)
                }
                className="rounded-md border border-line-strong px-3 py-2 text-sm font-normal text-slate-800 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              제목
              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((f) => ({ ...f, title: event.target.value }))
                }
                placeholder="예: 신규 시설 오픈"
                className="h-10 rounded-md border border-line-strong px-3 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              링크 URL (http/https)
              <input
                type="url"
                value={form.linkUrl}
                onChange={(event) =>
                  setForm((f) => ({ ...f, linkUrl: event.target.value }))
                }
                placeholder="https://..."
                className="h-10 rounded-md border border-line-strong px-3 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              정렬 순서 (작을수록 먼저)
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((f) => ({ ...f, sortOrder: event.target.value }))
                }
                className="h-10 rounded-md border border-line-strong px-3 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((f) => ({ ...f, isActive: event.target.checked }))
                }
                className="size-4"
              />
              노출 활성
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              노출 시작 (선택)
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((f) => ({ ...f, startsAt: event.target.value }))
                }
                className="h-10 rounded-md border border-line-strong px-3 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              노출 종료 (선택)
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm((f) => ({ ...f, endsAt: event.target.value }))
                }
                className="h-10 rounded-md border border-line-strong px-3 text-sm font-normal text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
          </div>

          {formError ? (
            <p
              className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              {submitting ? <AdminButtonSpinner /> : null}
              {editingId ? "수정 저장" : "배너 등록"}
            </button>
          </div>
        </form>

        {/* 목록 */}
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">등록된 배너</h2>

          {listState.status === "loading" ? (
            <AdminLoadingRow message="페이지를 불러오는 중입니다." />
          ) : null}

          {listState.status === "error" ? (
            <p
              className="mt-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error"
              role="alert"
            >
              {listState.message}
            </p>
          ) : null}

          {listState.status === "ready" && listState.banners.length === 0 ? (
            <AdminEmptyState
              title="등록된 배너가 없습니다"
              description="위 폼에서 첫 배너를 등록해 보세요."
            />
          ) : null}

          {listState.status === "ready" && listState.banners.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {listState.banners.map((banner) => (
                <li
                  key={banner.id}
                  className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:flex-row sm:items-center"
                >
                  <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md border border-line bg-slate-50">
                    <Image
                      src={banner.imageUrl}
                      alt={banner.title ?? "배너 이미지"}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          banner.isActive
                            ? "bg-success/10 text-success"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {banner.isActive ? "활성" : "비활성"}
                      </span>
                      <span className="truncate text-sm font-bold text-slate-950">
                        {banner.title ?? "(제목 없음)"}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        순서 {banner.sortOrder}
                      </span>
                    </div>
                    {banner.linkUrl ? (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {banner.linkUrl}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {banner.startsAt
                        ? formatAdminDateTime(banner.startsAt)
                        : "상시"}{" "}
                      ~ {banner.endsAt ? formatAdminDateTime(banner.endsAt) : "상시"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(banner)}
                      disabled={pendingId === banner.id}
                      className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {banner.isActive ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(banner)}
                      className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent-strong"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(banner)}
                      disabled={pendingId === banner.id}
                      className="rounded-md border border-error/30 px-2.5 py-1.5 text-xs font-semibold text-error transition hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </main>
  );
}
