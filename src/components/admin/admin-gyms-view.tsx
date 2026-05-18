"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_GYM_SPORTS,
  type AdminGymUpdateInput,
} from "@/lib/admin/admin-gym-schema";
import {
  createAdminGym,
  fetchAdminGyms,
  updateAdminGym,
} from "@/lib/admin/admin-gym-client";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin/admin-token";
import { formatGymPrice } from "@/lib/gym-utils";
import type { AdminGym, Sport } from "@/types/domain";

type GymsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; gyms: AdminGym[] }
  | { status: "error"; message: string };

type Notice = {
  tone: "success" | "error";
  message: string;
};

type StatusFilter = "all" | "active" | "inactive";
type FormMode = "create" | "edit";

type GymDraft = {
  id: string;
  name: string;
  region: string;
  address: string;
  officialUrl: string;
  openHours: string;
  basePrice: string;
  description: string;
  distanceKm: string;
  latitude: string;
  longitude: string;
  sports: Sport[];
  sportPrices: Record<Sport, string>;
  facilitiesText: string;
  availableTimesText: string;
  closedDaysText: string;
  isActive: boolean;
};

const noticeStyles: Record<Notice["tone"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "전체",
  active: "운영 중",
  inactive: "비활성",
};

const defaultSportPrices: Record<Sport, string> = {
  배드민턴: "5000",
  농구: "7000",
  풋살: "12000",
  탁구: "4000",
  배구: "7000",
};

const EMPTY_ADMIN_GYMS: AdminGym[] = [];

function createBlankDraft(): GymDraft {
  return {
    id: "",
    name: "",
    region: "",
    address: "",
    officialUrl: "https://",
    openHours: "09:00 - 18:00",
    basePrice: "5000",
    description: "",
    distanceKm: "0",
    latitude: "",
    longitude: "",
    sports: ["배드민턴"],
    sportPrices: { ...defaultSportPrices },
    facilitiesText: "샤워실\n탈의실",
    availableTimesText: "09:00\n11:00\n14:00\n18:00",
    closedDaysText: "",
    isActive: true,
  };
}

function draftFromGym(gym: AdminGym): GymDraft {
  return {
    id: gym.id,
    name: gym.name,
    region: gym.region,
    address: gym.address,
    officialUrl: gym.officialUrl,
    openHours: gym.openHours,
    basePrice: String(gym.basePrice),
    description: gym.description,
    distanceKm: String(gym.distanceKm),
    latitude: String(gym.latitude),
    longitude: String(gym.longitude),
    sports: gym.sports,
    sportPrices: ADMIN_GYM_SPORTS.reduce(
      (prices, sport) => ({
        ...prices,
        [sport]: String(gym.sportPrices[sport] ?? gym.basePrice),
      }),
      {} as Record<Sport, string>,
    ),
    facilitiesText: gym.facilities.join("\n"),
    availableTimesText: gym.availableTimes.join("\n"),
    closedDaysText: gym.closedDays.join("\n"),
    isActive: gym.isActive,
  };
}

function splitTextList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function sortGyms(gyms: AdminGym[]): AdminGym[] {
  return [...gyms].sort(
    (left, right) =>
      Number(right.isActive) - Number(left.isActive) ||
      left.region.localeCompare(right.region, "ko") ||
      left.name.localeCompare(right.name, "ko"),
  );
}

function upsertGym(gyms: AdminGym[], gym: AdminGym): AdminGym[] {
  const exists = gyms.some((item) => item.id === gym.id);
  const next = exists
    ? gyms.map((item) => (item.id === gym.id ? gym : item))
    : [gym, ...gyms];
  return sortGyms(next);
}

function buildPayload(
  draft: GymDraft,
  mode: FormMode,
): { ok: true; payload: AdminGym | AdminGymUpdateInput } | Notice {
  const basePrice = parseInteger(draft.basePrice);
  if (basePrice === null) {
    return { tone: "error", message: "기본 이용료는 정수로 입력해야 합니다." };
  }

  const distanceKm = Number.parseFloat(draft.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return { tone: "error", message: "거리는 0 이상의 숫자로 입력해야 합니다." };
  }

  // 위/경도는 거리 계산 SSOT라 둘 다 필수. 빈 문자열도 누락으로 본다.
  const latitudeRaw = draft.latitude.trim();
  const longitudeRaw = draft.longitude.trim();
  if (latitudeRaw.length === 0 || longitudeRaw.length === 0) {
    return {
      tone: "error",
      message: "위도와 경도는 모두 입력해야 합니다.",
    };
  }
  const latitude = Number.parseFloat(latitudeRaw);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return {
      tone: "error",
      message: "위도는 -90 이상 90 이하의 숫자여야 합니다.",
    };
  }
  const longitude = Number.parseFloat(longitudeRaw);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return {
      tone: "error",
      message: "경도는 -180 이상 180 이하의 숫자여야 합니다.",
    };
  }

  if (draft.sports.length === 0) {
    return { tone: "error", message: "종목을 1개 이상 선택해야 합니다." };
  }

  const sportPrices: Partial<Record<Sport, number>> = {};
  for (const sport of draft.sports) {
    const price = parseInteger(draft.sportPrices[sport]);
    if (price === null) {
      return {
        tone: "error",
        message: `${sport} 이용료는 정수로 입력해야 합니다.`,
      };
    }
    sportPrices[sport] = price;
  }

  const basePayload: AdminGymUpdateInput = {
    name: draft.name.trim(),
    region: draft.region.trim(),
    address: draft.address.trim(),
    officialUrl: draft.officialUrl.trim(),
    openHours: draft.openHours.trim(),
    basePrice,
    description: draft.description.trim(),
    distanceKm,
    latitude,
    longitude,
    sports: draft.sports,
    sportPrices,
    facilities: splitTextList(draft.facilitiesText),
    availableTimes: splitTextList(draft.availableTimesText),
    closedDays: splitTextList(draft.closedDaysText),
    isActive: draft.isActive,
  };

  if (mode === "edit") {
    return { ok: true, payload: basePayload };
  }

  return {
    ok: true,
    payload: {
      id: draft.id.trim(),
      ...basePayload,
    },
  };
}

export function AdminGymsView() {
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [gymsState, setGymsState] = useState<GymsState>({ status: "idle" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [draft, setDraft] = useState<GymDraft>(createBlankDraft);
  const [saving, setSaving] = useState(false);

  const gyms =
    gymsState.status === "ready" ? gymsState.gyms : EMPTY_ADMIN_GYMS;
  const filteredGyms = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    return gyms.filter((gym) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? gym.isActive : !gym.isActive);
      const matchesQuery =
        query.length === 0 ||
        [gym.id, gym.name, gym.region, gym.address]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesStatus && matchesQuery;
    });
  }, [gyms, searchInput, statusFilter]);

  const counts = useMemo(
    () => ({
      total: gyms.length,
      active: gyms.filter((gym) => gym.isActive).length,
      inactive: gyms.filter((gym) => !gym.isActive).length,
    }),
    [gyms],
  );

  const loadGyms = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? savedToken;
      if (!token) {
        setGymsState({
          status: "error",
          message: "관리자 토큰을 저장한 뒤 시설 목록을 조회할 수 있습니다.",
        });
        return;
      }

      setGymsState({ status: "loading" });
      setNotice(null);
      const result = await fetchAdminGyms(token);

      if (result.ok) {
        setGymsState({ status: "ready", gyms: sortGyms(result.gyms) });
        return;
      }

      setGymsState({ status: "error", message: result.message });
    },
    [savedToken],
  );

  // hydration 이후 sessionStorage의 토큰을 한 번만 읽는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
      if (stored) {
        setSavedToken(stored);
        setTokenInput(stored);
        void loadGyms(stored);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadGyms]);

  const handleSaveToken = () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
    setSavedToken(trimmed);
    void loadGyms(trimmed);
  };

  const handleForgetToken = () => {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setSavedToken(null);
    setTokenInput("");
    setGymsState({ status: "idle" });
    setNotice(null);
  };

  const handleNew = () => {
    setFormMode("create");
    setDraft(createBlankDraft());
    setNotice(null);
  };

  const handleSelectGym = (gym: AdminGym) => {
    setFormMode("edit");
    setDraft(draftFromGym(gym));
    setNotice(null);
  };

  const updateDraft = (partial: Partial<GymDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const handleSportToggle = (sport: Sport) => {
    setDraft((prev) => {
      const selected = prev.sports.includes(sport);
      const sports = selected
        ? prev.sports.filter((item) => item !== sport)
        : [...prev.sports, sport];

      return { ...prev, sports };
    });
  };

  const handleSportPriceChange = (sport: Sport, value: string) => {
    setDraft((prev) => ({
      ...prev,
      sportPrices: {
        ...prev.sportPrices,
        [sport]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!savedToken || saving) {
      setNotice({
        tone: "error",
        message: "관리자 토큰을 저장한 뒤 시설 정보를 저장할 수 있습니다.",
      });
      return;
    }

    const payload = buildPayload(draft, formMode);
    if (!("ok" in payload)) {
      setNotice(payload);
      return;
    }

    setSaving(true);
    setNotice(null);

    const result =
      formMode === "create"
        ? await createAdminGym(payload.payload as AdminGym, savedToken)
        : await updateAdminGym(
            draft.id,
            payload.payload as AdminGymUpdateInput,
            savedToken,
          );

    if (result.ok) {
      setGymsState((prev) => ({
        status: "ready",
        gyms: upsertGym(prev.status === "ready" ? prev.gyms : [], result.gym),
      }));
      setFormMode("edit");
      setDraft(draftFromGym(result.gym));
      setNotice({ tone: "success", message: result.message });
    } else {
      setNotice({ tone: "error", message: result.message });
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">관리자</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              시설 관리
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              관리자 홈
            </Link>
            <Link
              href="/admin/reservations"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              예약 관리
            </Link>
            <Link
              href="/admin/reservation-slots"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              슬롯 관리
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-950">관리자 토큰</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="x-admin-token 값"
              autoComplete="off"
              spellCheck={false}
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={tokenInput.trim().length === 0}
                className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                토큰 저장
              </button>
              <button
                type="button"
                onClick={handleForgetToken}
                disabled={!savedToken && tokenInput.length === 0}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
              >
                토큰 잊기
              </button>
            </div>
          </div>
          <p
            className={`mt-2 text-xs font-semibold ${savedToken ? "text-emerald-700" : "text-amber-700"}`}
            role="status"
          >
            {savedToken
              ? "토큰이 세션에 저장되어 관리자 요청에 사용됩니다."
              : "저장된 토큰이 없습니다."}
          </p>
        </section>

        {notice ? (
          <div
            role="alert"
            className={`rounded-lg border px-4 py-3 text-sm font-semibold ${noticeStyles[notice.tone]}`}
          >
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-950">시설 목록</h2>
                <p className="mt-1 text-xs text-slate-500">
                  전체 {counts.total}개 · 운영 중 {counts.active}개 · 비활성{" "}
                  {counts.inactive}개
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadGyms()}
                  disabled={!savedToken || gymsState.status === "loading"}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  새로고침
                </button>
                <button
                  type="button"
                  onClick={handleNew}
                  className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  신규 시설
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="시설명, 지역구, 주소"
                className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              />
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="시설 상태 필터"
              >
                {(Object.keys(statusFilterLabels) as StatusFilter[]).map(
                  (filter) => {
                    const selected = statusFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setStatusFilter(filter)}
                        className={`h-9 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                          selected
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-800"
                        }`}
                      >
                        {statusFilterLabels[filter]}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {gymsState.status === "idle" ? (
              <p className="mt-5 text-sm text-slate-500">
                관리자 토큰 저장 후 시설 목록을 조회할 수 있습니다.
              </p>
            ) : null}

            {gymsState.status === "loading" ? (
              <p className="mt-5 text-sm text-slate-500">
                시설 목록을 불러오는 중입니다.
              </p>
            ) : null}

            {gymsState.status === "error" ? (
              <p
                className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                role="alert"
              >
                {gymsState.message}
              </p>
            ) : null}

            {gymsState.status === "ready" ? (
              filteredGyms.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">
                  조건에 맞는 시설이 없습니다.
                </p>
              ) : (
                <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                  {filteredGyms.map((gym) => {
                    const selected =
                      formMode === "edit" && draft.id === gym.id;
                    return (
                      <button
                        key={gym.id}
                        type="button"
                        onClick={() => handleSelectGym(gym)}
                        className={`grid w-full gap-2 px-2 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                          selected ? "bg-sky-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">
                              {gym.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {gym.region} · {gym.sports.join(", ")}
                            </p>
                          </div>
                          <span
                            className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-xs font-semibold ${
                              gym.isActive
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {gym.isActive ? "운영 중" : "비활성"}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-slate-400">
                          {gym.id}
                        </p>
                        <p className="text-xs text-slate-500">{gym.address}</p>
                        <p className="text-xs font-semibold text-slate-600">
                          기본 {formatGymPrice(gym.basePrice)} ·{" "}
                          {gym.availableTimes.length}개 시간대
                        </p>
                      </button>
                    );
                  })}
                </div>
              )
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  {formMode === "create" ? "신규 시설" : "시설 정보 수정"}
                </h2>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {formMode === "create" ? "new-gym" : draft.id}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    updateDraft({ isActive: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                운영 중
              </label>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  시설 ID
                  <input
                    type="text"
                    value={draft.id}
                    onChange={(event) => updateDraft({ id: event.target.value })}
                    disabled={formMode === "edit"}
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  시설명
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft({ name: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  지역구
                  <input
                    type="text"
                    value={draft.region}
                    onChange={(event) =>
                      updateDraft({ region: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  운영시간
                  <input
                    type="text"
                    value={draft.openHours}
                    onChange={(event) =>
                      updateDraft({ openHours: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                주소
                <input
                  type="text"
                  value={draft.address}
                  onChange={(event) =>
                    updateDraft({ address: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                공식 URL
                <input
                  type="url"
                  value={draft.officialUrl}
                  onChange={(event) =>
                    updateDraft({ officialUrl: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  기본 이용료
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={draft.basePrice}
                    onChange={(event) =>
                      updateDraft({ basePrice: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  거리(km)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={draft.distanceKm}
                    onChange={(event) =>
                      updateDraft({ distanceKm: event.target.value })
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  위도 (latitude)
                  <input
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    value={draft.latitude}
                    onChange={(event) =>
                      updateDraft({ latitude: event.target.value })
                    }
                    placeholder="예: 37.5665"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  경도 (longitude)
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    value={draft.longitude}
                    onChange={(event) =>
                      updateDraft({ longitude: event.target.value })
                    }
                    placeholder="예: 126.9780"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                설명
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft({ description: event.target.value })
                  }
                  rows={3}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              </label>

              <fieldset className="grid gap-2">
                <legend className="text-xs font-semibold text-slate-700">
                  종목 및 이용료
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ADMIN_GYM_SPORTS.map((sport) => {
                    const selected = draft.sports.includes(sport);
                    return (
                      <div
                        key={sport}
                        className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-slate-200 px-3 py-2"
                      >
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleSportToggle(sport)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {sport}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={draft.sportPrices[sport]}
                          onChange={(event) =>
                            handleSportPriceChange(sport, event.target.value)
                          }
                          disabled={!selected}
                          aria-label={`${sport} 이용료`}
                          className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  편의시설
                  <textarea
                    value={draft.facilitiesText}
                    onChange={(event) =>
                      updateDraft({ facilitiesText: event.target.value })
                    }
                    rows={5}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  예약 가능 시간
                  <textarea
                    value={draft.availableTimesText}
                    onChange={(event) =>
                      updateDraft({ availableTimesText: event.target.value })
                    }
                    rows={5}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                  휴관일
                  <textarea
                    value={draft.closedDaysText}
                    onChange={(event) =>
                      updateDraft({ closedDaysText: event.target.value })
                    }
                    rows={5}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  {saving ? "저장 중" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={handleNew}
                  disabled={saving}
                  className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  입력 초기화
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
