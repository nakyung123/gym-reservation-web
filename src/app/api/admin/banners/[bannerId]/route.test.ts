import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/admin/banners/[bannerId]/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createBanner } from "@/lib/server/db-banner-repository";
import {
  deleteBannerImage,
  uploadBannerImage,
} from "@/lib/server/supabase-storage";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

vi.mock("@/lib/server/supabase-storage", () => ({
  uploadBannerImage: vi.fn(),
  deleteBannerImage: vi.fn().mockResolvedValue(undefined),
  bannerPublicUrl: vi.fn((path: string) => `https://test/${path}`),
}));

const BEARER = "Bearer admin-test-id-token";

function setAdminAuthOk() {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValue({
    ok: true,
    uid: "admin-test-uid",
  });
}

function metaForm(isActive = "true"): FormData {
  const form = new FormData();
  form.set("title", "수정 제목");
  form.set("sortOrder", "0");
  form.set("isActive", isActive);
  return form;
}

function withImageForm(): FormData {
  const form = metaForm();
  form.set(
    "image",
    new File([new Uint8Array([0xff, 0xd8, 0xff])], "b.jpg", {
      type: "image/jpeg",
    }),
  );
  return form;
}

function params(bannerId: string) {
  return { params: Promise.resolve({ bannerId }) };
}

async function makeBanner() {
  return createBanner({
    imagePath: "orig.jpg",
    meta: {
      linkUrl: null,
      title: "원본",
      sortOrder: 0,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
  });
}

describe("PATCH /api/admin/banners/[bannerId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
    vi.mocked(uploadBannerImage).mockResolvedValue({
      ok: true,
      path: "replaced.jpg",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("이미지 없이 메타만 수정한다", async () => {
    const banner = await makeBanner();
    const request = new NextRequest(
      `http://localhost:3000/api/admin/banners/${banner.id}`,
      { method: "PATCH", headers: { authorization: BEARER }, body: metaForm("false") },
    );

    const response = await PATCH(request, params(banner.id));
    const body = (await response.json()) as { banner?: { title?: string; isActive?: boolean; imageUrl?: string } };

    expect(response.status).toBe(200);
    expect(body.banner?.title).toBe("수정 제목");
    expect(body.banner?.isActive).toBe(false);
    // 이미지 미교체 → 기존 경로 유지
    expect(body.banner?.imageUrl).toBe("https://test/orig.jpg");
    expect(uploadBannerImage).not.toHaveBeenCalled();
    // 이미지 미교체 → 기존 Storage 객체 정리도 없어야 한다.
    expect(deleteBannerImage).not.toHaveBeenCalled();
  });

  it("이미지가 함께 오면 교체한다", async () => {
    const banner = await makeBanner();
    const request = new NextRequest(
      `http://localhost:3000/api/admin/banners/${banner.id}`,
      { method: "PATCH", headers: { authorization: BEARER }, body: withImageForm() },
    );

    const response = await PATCH(request, params(banner.id));
    const body = (await response.json()) as { banner?: { imageUrl?: string } };

    expect(response.status).toBe(200);
    expect(uploadBannerImage).toHaveBeenCalledOnce();
    expect(body.banner?.imageUrl).toBe("https://test/replaced.jpg");
    // 밀려난 기존 객체(orig.jpg)는 Storage에서 정리되어야 한다.
    expect(deleteBannerImage).toHaveBeenCalledWith("orig.jpg");
  });

  it("대상이 없으면 404를 반환한다", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/admin/banners/nope",
      { method: "PATCH", headers: { authorization: BEARER }, body: metaForm() },
    );

    const response = await PATCH(request, params("nope"));
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/admin/banners/[bannerId]", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("배너를 삭제하고 Storage 객체도 제거한다", async () => {
    const banner = await makeBanner();
    const request = new NextRequest(
      `http://localhost:3000/api/admin/banners/${banner.id}`,
      { method: "DELETE", headers: { authorization: BEARER } },
    );

    const response = await DELETE(request, params(banner.id));

    expect(response.status).toBe(200);
    expect(deleteBannerImage).toHaveBeenCalledWith("orig.jpg");
  });

  it("대상이 없으면 404를 반환한다", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/admin/banners/nope",
      { method: "DELETE", headers: { authorization: BEARER } },
    );

    const response = await DELETE(request, params("nope"));
    expect(response.status).toBe(404);
  });
});
