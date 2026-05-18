import { SPORTS, isSport } from "@/lib/domain-constants";
import type { AdminGym, Sport } from "@/types/domain";

export const ADMIN_GYM_SPORTS = SPORTS;
export { isSport };

export type AdminGymUpdateInput = Omit<AdminGym, "id">;

type ValidationResult<T> =
  | { ok: true; input: T }
  | { ok: false; message: string };

const gymIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseText(
  value: unknown,
  fieldLabel: string,
  { min = 1, max = 500 }: { min?: number; max?: number } = {},
): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, message: `${fieldLabel}은 문자열이어야 합니다.` };
  }

  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return {
      ok: false,
      message: `${fieldLabel}은 ${min}자 이상 ${max}자 이하로 입력해야 합니다.`,
    };
  }

  return { ok: true, input: trimmed };
}

function parsePositiveInteger(
  value: unknown,
  fieldLabel: string,
): ValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 999_999
  ) {
    return {
      ok: false,
      message: `${fieldLabel}은 0 이상 999999 이하의 정수여야 합니다.`,
    };
  }

  return { ok: true, input: value };
}

// 주의: 현재 `distanceKm`은 사용자 표시 거리 계산에 더 이상 사용되지 않는다.
// 거리 표시/정렬은 `src/lib/distance.ts`가 사용자 현재 위치 + `src/data/gym-coordinates.json`
// 좌표로 실시간 계산한다. 이 필드는 DB 스키마/admin form 호환을 위해 유지되며,
// 새 체육관을 추가할 때 좌표도 별도로 `src/data/gym-coordinates.json`에 추가해야 한다.
function parseDistance(value: unknown): ValidationResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 999
  ) {
    return {
      ok: false,
      message: "거리는 0 이상 999 이하의 숫자여야 합니다.",
    };
  }

  return { ok: true, input: Number(value.toFixed(2)) };
}

function parseUrl(value: unknown): ValidationResult<string> {
  const parsed = parseText(value, "공식 URL", { min: 8, max: 500 });
  if (!parsed.ok) return parsed;

  try {
    const url = new URL(parsed.input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        message: "공식 URL은 http 또는 https 주소여야 합니다.",
      };
    }
  } catch {
    return { ok: false, message: "공식 URL 형식이 올바르지 않습니다." };
  }

  return parsed;
}

function parseStringArray(
  value: unknown,
  fieldLabel: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: `${fieldLabel}은 배열이어야 합니다.` };
  }

  if (value.some((item) => typeof item !== "string")) {
    return { ok: false, message: `${fieldLabel} 항목은 문자열이어야 합니다.` };
  }

  const items = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const uniqueItems = Array.from(new Set(items));

  if (!allowEmpty && uniqueItems.length === 0) {
    return { ok: false, message: `${fieldLabel}은 1개 이상 필요합니다.` };
  }

  if (uniqueItems.some((item) => item.length > 100)) {
    return {
      ok: false,
      message: `${fieldLabel} 항목은 100자 이하로 입력해야 합니다.`,
    };
  }

  return { ok: true, input: uniqueItems };
}

function parseTimes(value: unknown): ValidationResult<string[]> {
  const parsed = parseStringArray(value, "예약 가능 시간");
  if (!parsed.ok) return parsed;

  const invalid = parsed.input.find((time) => !timePattern.test(time));
  if (invalid) {
    return {
      ok: false,
      message: `예약 가능 시간은 HH:mm 형식이어야 합니다: ${invalid}`,
    };
  }

  return { ok: true, input: parsed.input.sort() };
}

function parseSports(value: unknown): ValidationResult<Sport[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "종목은 배열이어야 합니다." };
  }

  const sports: Sport[] = [];
  for (const item of value) {
    if (!isSport(item)) {
      return { ok: false, message: `지원하지 않는 종목입니다: ${String(item)}` };
    }
    if (!sports.includes(item)) {
      sports.push(item);
    }
  }

  if (sports.length === 0) {
    return { ok: false, message: "종목은 1개 이상 선택해야 합니다." };
  }

  return { ok: true, input: sports };
}

function parseSportPrices(
  value: unknown,
  sports: Sport[],
): ValidationResult<Partial<Record<Sport, number>>> {
  if (!isRecord(value)) {
    return { ok: false, message: "종목별 이용료 형식이 올바르지 않습니다." };
  }

  const result: Partial<Record<Sport, number>> = {};
  for (const sport of sports) {
    const price = value[sport];
    const parsed = parsePositiveInteger(price, `${sport} 이용료`);
    if (!parsed.ok) return parsed;
    result[sport] = parsed.input;
  }

  return { ok: true, input: result };
}

function parseId(value: unknown): ValidationResult<string> {
  const parsed = parseText(value, "시설 ID", { min: 2, max: 64 });
  if (!parsed.ok) return parsed;

  if (!gymIdPattern.test(parsed.input)) {
    return {
      ok: false,
      message: "시설 ID는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.",
    };
  }

  return parsed;
}

function parseAdminGymBase(
  body: unknown,
): ValidationResult<AdminGymUpdateInput> {
  if (!isRecord(body)) {
    return { ok: false, message: "요청 본문이 올바르지 않습니다." };
  }

  const name = parseText(body.name, "시설명", { max: 200 });
  if (!name.ok) return name;
  const region = parseText(body.region, "지역구", { max: 100 });
  if (!region.ok) return region;
  const address = parseText(body.address, "주소", { max: 300 });
  if (!address.ok) return address;
  const officialUrl = parseUrl(body.officialUrl);
  if (!officialUrl.ok) return officialUrl;
  const openHours = parseText(body.openHours, "운영시간", { max: 100 });
  if (!openHours.ok) return openHours;
  const basePrice = parsePositiveInteger(body.basePrice, "기본 이용료");
  if (!basePrice.ok) return basePrice;
  const description = parseText(body.description, "설명", {
    min: 5,
    max: 2000,
  });
  if (!description.ok) return description;
  const distanceKm = parseDistance(body.distanceKm);
  if (!distanceKm.ok) return distanceKm;
  const sports = parseSports(body.sports);
  if (!sports.ok) return sports;
  const sportPrices = parseSportPrices(body.sportPrices, sports.input);
  if (!sportPrices.ok) return sportPrices;
  const facilities = parseStringArray(body.facilities, "편의시설");
  if (!facilities.ok) return facilities;
  const availableTimes = parseTimes(body.availableTimes);
  if (!availableTimes.ok) return availableTimes;
  const closedDays = parseStringArray(body.closedDays, "휴관일", {
    allowEmpty: true,
  });
  if (!closedDays.ok) return closedDays;

  if (typeof body.isActive !== "boolean") {
    return { ok: false, message: "운영 상태는 boolean이어야 합니다." };
  }

  return {
    ok: true,
    input: {
      name: name.input,
      region: region.input,
      address: address.input,
      officialUrl: officialUrl.input,
      openHours: openHours.input,
      basePrice: basePrice.input,
      description: description.input,
      distanceKm: distanceKm.input,
      sports: sports.input,
      sportPrices: sportPrices.input,
      facilities: facilities.input,
      availableTimes: availableTimes.input,
      closedDays: closedDays.input,
      isActive: body.isActive,
    },
  };
}

export function validateAdminGymPayload(
  body: unknown,
  options: { requireId: true },
): ValidationResult<AdminGym>;
export function validateAdminGymPayload(
  body: unknown,
  options: { requireId: false },
): ValidationResult<AdminGymUpdateInput>;
export function validateAdminGymPayload(
  body: unknown,
  options: { requireId: boolean },
): ValidationResult<AdminGym | AdminGymUpdateInput> {
  const base = parseAdminGymBase(body);
  if (!base.ok) return base;

  if (!options.requireId) {
    return base;
  }

  const id = parseId(isRecord(body) ? body.id : undefined);
  if (!id.ok) return id;

  return { ok: true, input: { id: id.input, ...base.input } };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSportPriceMap(
  value: unknown,
): value is Partial<Record<Sport, number>> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([sport, price]) =>
        isSport(sport) && typeof price === "number" && Number.isFinite(price),
    )
  );
}

export function isAdminGym(value: unknown): value is AdminGym {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.region === "string" &&
    typeof value.address === "string" &&
    typeof value.officialUrl === "string" &&
    typeof value.openHours === "string" &&
    typeof value.basePrice === "number" &&
    Number.isFinite(value.basePrice) &&
    typeof value.description === "string" &&
    typeof value.distanceKm === "number" &&
    Number.isFinite(value.distanceKm) &&
    Array.isArray(value.sports) &&
    value.sports.every(isSport) &&
    isSportPriceMap(value.sportPrices) &&
    isStringArray(value.facilities) &&
    isStringArray(value.availableTimes) &&
    isStringArray(value.closedDays) &&
    typeof value.isActive === "boolean"
  );
}
