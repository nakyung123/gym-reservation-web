import "server-only";
import type { Banner as BannerRow } from "@prisma/client";
import type {
  Banner,
  BannerMetaInput,
  PublicBanner,
} from "@/lib/admin/banner";
import { prisma } from "@/lib/server/prisma-client";
import { bannerPublicUrl } from "@/lib/server/supabase-storage";

// 운영 배너의 DB 접근 경계.
// SSOT: imagePath(uuid.ext). imageUrl(public URL)은 응답 시 imagePath에서 파생한다.
// 노출 조건: isActive && (startsAt<=now<=endsAt, null이면 상시). 정렬: sortOrder asc, createdAt desc.

function parseDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

function toBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    imageUrl: bannerPublicUrl(row.imagePath),
    linkUrl: row.linkUrl,
    title: row.title,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBanners(): Promise<Banner[]> {
  const rows = await prisma.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toBanner);
}

// 홈 공개 노출용. now 기준으로 활성+기간 필터링한 뒤 최소 형태로 내려준다.
export async function listActiveBanners(
  now: Date = new Date(),
): Promise<PublicBanner[]> {
  const rows = await prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    imageUrl: bannerPublicUrl(row.imagePath),
    linkUrl: row.linkUrl,
    title: row.title,
  }));
}

export async function createBanner(input: {
  imagePath: string;
  meta: BannerMetaInput;
}): Promise<Banner> {
  const { imagePath, meta } = input;
  const row = await prisma.banner.create({
    data: {
      imagePath,
      linkUrl: meta.linkUrl,
      title: meta.title,
      sortOrder: meta.sortOrder,
      isActive: meta.isActive,
      startsAt: parseDate(meta.startsAt),
      endsAt: parseDate(meta.endsAt),
    },
  });
  return toBanner(row);
}

// 기존 imagePath를 반환한다(이미지 교체 시 이전 객체 정리, 삭제 시 객체 제거에 사용).
export async function getBannerImagePath(id: string): Promise<string | null> {
  const row = await prisma.banner.findUnique({
    where: { id },
    select: { imagePath: true },
  });
  return row?.imagePath ?? null;
}

// 메타를 갱신한다. imagePath가 주어지면 이미지도 교체한다. 대상이 없으면 null.
export async function updateBanner(
  id: string,
  input: { meta: BannerMetaInput; imagePath?: string },
): Promise<Banner | null> {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }
  const { meta, imagePath } = input;
  const row = await prisma.banner.update({
    where: { id },
    data: {
      ...(imagePath ? { imagePath } : {}),
      linkUrl: meta.linkUrl,
      title: meta.title,
      sortOrder: meta.sortOrder,
      isActive: meta.isActive,
      startsAt: parseDate(meta.startsAt),
      endsAt: parseDate(meta.endsAt),
    },
  });
  return toBanner(row);
}

// DB 행을 삭제하고 삭제된 imagePath를 돌려준다(Storage 객체 정리에 사용). 대상이 없으면 null.
// 이미 삭제된 경우(중복 호출)도 null을 반환해 멱등하게 동작한다.
export async function deleteBanner(
  id: string,
): Promise<{ imagePath: string } | null> {
  const existing = await prisma.banner.findUnique({
    where: { id },
    select: { imagePath: true },
  });
  if (!existing) {
    return null;
  }
  await prisma.banner.delete({ where: { id } });
  return { imagePath: existing.imagePath };
}
