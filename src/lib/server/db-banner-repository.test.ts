import { describe, expect, it } from "vitest";
import type { BannerMetaInput } from "@/lib/admin/banner";
import {
  createBanner,
  deleteBanner,
  getBannerImagePath,
  listActiveBanners,
  listBanners,
  updateBanner,
} from "@/lib/server/db-banner-repository";

const BASE_URL = "https://test-project.supabase.co";

function meta(over: Partial<BannerMetaInput> = {}): BannerMetaInput {
  return {
    linkUrl: null,
    title: null,
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...over,
  };
}

describe("db-banner-repository", () => {
  it("createBanner는 imagePath에서 파생한 public URL을 포함해 반환한다", async () => {
    const banner = await createBanner({
      imagePath: "abc.jpg",
      meta: meta({ title: "테스트 배너", linkUrl: "https://example.com" }),
    });

    expect(banner.imageUrl).toBe(
      `${BASE_URL}/storage/v1/object/public/banners/abc.jpg`,
    );
    expect(banner.title).toBe("테스트 배너");
    expect(banner.linkUrl).toBe("https://example.com");
    expect(banner.isActive).toBe(true);

    const all = await listBanners();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(banner.id);
  });

  it("listActiveBanners는 활성·노출기간을 만족하는 배너만 정렬해 반환한다", async () => {
    const now = new Date("2026-06-15T00:00:00.000Z");

    const visible = await createBanner({
      imagePath: "visible.jpg",
      meta: meta({ title: "상시", sortOrder: 1 }),
    });
    const visibleEarlier = await createBanner({
      imagePath: "earlier.jpg",
      meta: meta({ title: "먼저", sortOrder: 0 }),
    });
    // 비활성 → 제외
    await createBanner({
      imagePath: "inactive.jpg",
      meta: meta({ isActive: false }),
    });
    // 아직 시작 전 → 제외
    await createBanner({
      imagePath: "future.jpg",
      meta: meta({ startsAt: "2026-07-01T00:00:00.000Z" }),
    });
    // 이미 종료 → 제외
    await createBanner({
      imagePath: "expired.jpg",
      meta: meta({ endsAt: "2026-06-01T00:00:00.000Z" }),
    });

    const active = await listActiveBanners(now);

    expect(active.map((b) => b.id)).toEqual([visibleEarlier.id, visible.id]);
    expect(active[0].imageUrl).toContain("earlier.jpg");
    // 공개 형태는 운영 메타를 포함하지 않는다.
    expect(active[0]).not.toHaveProperty("isActive");
  });

  it("updateBanner는 메타를 갱신하고, 이미지가 주어지면 교체한다", async () => {
    const created = await createBanner({
      imagePath: "old.jpg",
      meta: meta({ title: "원본", isActive: true }),
    });

    const updated = await updateBanner(created.id, {
      meta: meta({ title: "수정됨", isActive: false }),
      imagePath: "new.jpg",
    });

    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("수정됨");
    expect(updated?.isActive).toBe(false);
    expect(updated?.imageUrl).toContain("new.jpg");
  });

  it("updateBanner는 대상이 없으면 null을 반환한다", async () => {
    const result = await updateBanner("nonexistent", { meta: meta() });
    expect(result).toBeNull();
  });

  it("getBannerImagePath는 imagePath를, 없으면 null을 반환한다", async () => {
    const created = await createBanner({
      imagePath: "path.png",
      meta: meta(),
    });
    expect(await getBannerImagePath(created.id)).toBe("path.png");
    expect(await getBannerImagePath("nope")).toBeNull();
  });

  it("deleteBanner는 imagePath를 돌려주며 멱등하다(재호출 시 null)", async () => {
    const created = await createBanner({
      imagePath: "del.webp",
      meta: meta(),
    });

    const removed = await deleteBanner(created.id);
    expect(removed).toEqual({ imagePath: "del.webp" });

    expect(await deleteBanner(created.id)).toBeNull();
    expect(await listBanners()).toHaveLength(0);
  });
});
