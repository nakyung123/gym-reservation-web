"use client";

import Image from "next/image";
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
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_FIELD_LABEL_CLASS,
  AdminErrorNotice,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/app-button";

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
    <div className="flex flex-col gap-6">
      {/* 생성/수정 폼 */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-5 rounded-xl border border-line bg-white p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-foreground">
            {editingId ? "배너 수정" : "새 배너 등록"}
          </h2>
          {editingId ? (
            <Button variant="ghost" size="xs" onClick={resetForm}>
              새 배너로 전환
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="banner-image" className={ADMIN_FIELD_LABEL_CLASS}>
              이미지 {editingId ? "(변경 시에만 선택)" : "(필수)"}
            </label>
            <input
              id="banner-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setImageFile(event.target.files?.[0] ?? null)
              }
              className="rounded-[10px] border border-line-strong bg-white px-3.5 py-3 text-[13.5px] text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[13px] file:font-bold file:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="banner-title" className={ADMIN_FIELD_LABEL_CLASS}>
              제목
            </label>
            <input
              id="banner-title"
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm((f) => ({ ...f, title: event.target.value }))
              }
              placeholder="예: 신규 시설 오픈"
              className={`${ADMIN_CONTROL_CLASS} placeholder:text-subtle`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="banner-link" className={ADMIN_FIELD_LABEL_CLASS}>
              링크 URL (http/https)
            </label>
            <input
              id="banner-link"
              type="url"
              value={form.linkUrl}
              onChange={(event) =>
                setForm((f) => ({ ...f, linkUrl: event.target.value }))
              }
              placeholder="https://..."
              className={`${ADMIN_CONTROL_CLASS} placeholder:text-subtle`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="banner-sort" className={ADMIN_FIELD_LABEL_CLASS}>
              정렬 순서 (작을수록 먼저)
            </label>
            <input
              id="banner-sort"
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((f) => ({ ...f, sortOrder: event.target.value }))
              }
              className={`${ADMIN_CONTROL_CLASS} tabular-nums`}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-3.5 text-[13.5px] font-semibold text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((f) => ({ ...f, isActive: event.target.checked }))
              }
              className="size-4 accent-[--color-accent]"
            />
            노출 활성
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="banner-starts" className={ADMIN_FIELD_LABEL_CLASS}>
              노출 시작 (선택)
            </label>
            <input
              id="banner-starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((f) => ({ ...f, startsAt: event.target.value }))
              }
              className={ADMIN_CONTROL_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="banner-ends" className={ADMIN_FIELD_LABEL_CLASS}>
              노출 종료 (선택)
            </label>
            <input
              id="banner-ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((f) => ({ ...f, endsAt: event.target.value }))
              }
              className={ADMIN_CONTROL_CLASS}
            />
          </div>
        </div>

        {formError ? <AdminErrorNotice message={formError} /> : null}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? <AdminButtonSpinner /> : null}
            {editingId ? "수정 저장" : "배너 등록"}
          </Button>
        </div>
      </form>

      {/* 목록 */}
      <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-[15px] font-bold text-foreground">
          등록된 배너
        </h2>

        {listState.status === "loading" ? (
          <AdminLoadingRow message="페이지를 불러오는 중입니다." />
        ) : null}

        {listState.status === "error" ? (
          <AdminErrorNotice message={listState.message} />
        ) : null}

        {listState.status === "ready" && listState.banners.length === 0 ? (
          <AdminEmptyState
            title="등록된 배너가 없습니다"
            description="위 폼에서 첫 배너를 등록해 보세요."
          />
        ) : null}

        {listState.status === "ready" && listState.banners.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {listState.banners.map((banner) => (
              <li
                key={banner.id}
                className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:flex-row sm:items-center"
              >
                <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
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
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
                        banner.isActive
                          ? "bg-success/10 text-success"
                          : "bg-surface-2 text-muted"
                      }`}
                    >
                      {banner.isActive ? "활성" : "비활성"}
                    </span>
                    <span className="truncate text-[13.5px] font-bold text-foreground">
                      {banner.title ?? "(제목 없음)"}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-subtle">
                      순서 {banner.sortOrder}
                    </span>
                  </div>
                  {banner.linkUrl ? (
                    <p className="mt-1.5 truncate text-[13px] text-muted">
                      {banner.linkUrl}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[13px] tabular-nums text-subtle">
                    {banner.startsAt
                      ? formatAdminDateTime(banner.startsAt)
                      : "상시"}{" "}
                    ~ {banner.endsAt ? formatAdminDateTime(banner.endsAt) : "상시"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void handleToggleActive(banner)}
                    disabled={pendingId === banner.id}
                  >
                    {banner.isActive ? "비활성화" : "활성화"}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => startEdit(banner)}
                  >
                    수정
                  </Button>
                  <Button
                    variant="danger-outline"
                    size="xs"
                    onClick={() => void handleDelete(banner)}
                    disabled={pendingId === banner.id}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
