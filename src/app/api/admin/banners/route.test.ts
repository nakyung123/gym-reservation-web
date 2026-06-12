import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/banners/route";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { createBanner } from "@/lib/server/db-banner-repository";
import { uploadBannerImage } from "@/lib/server/supabase-storage";

vi.mock("@/lib/server/admin-auth", () => ({
  verifyAdminTokenFromRequest: vi.fn(),
}));

// Storage는 mock한다(실제 Supabase 접근 금지). bannerPublicUrl은 repository가 URL 파생에 쓴다.
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

function setAdminAuthError(status: 401 | 403, message: string) {
  vi.mocked(verifyAdminTokenFromRequest).mockResolvedValueOnce({
    ok: false,
    status,
    message,
  });
}

function bannerForm(
  overrides: {
    withImage?: boolean;
    linkUrl?: string;
    title?: string;
    sortOrder?: string;
    isActive?: string;
  } = {},
): FormData {
  const form = new FormData();
  if (overrides.withImage !== false) {
    form.set(
      "image",
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "b.jpg", {
        type: "image/jpeg",
      }),
    );
  }
  if (overrides.linkUrl !== undefined) form.set("linkUrl", overrides.linkUrl);
  if (overrides.title !== undefined) form.set("title", overrides.title);
  form.set("sortOrder", overrides.sortOrder ?? "0");
  form.set("isActive", overrides.isActive ?? "true");
  return form;
}

function postRequest(form: FormData, bearer = BEARER) {
  return new NextRequest("http://localhost:3000/api/admin/banners", {
    method: "POST",
    headers: { authorization: bearer },
    body: form,
  });
}

describe("POST /api/admin/banners", () => {
  beforeEach(() => {
    setAdminAuthOk();
    vi.mocked(uploadBannerImage).mockResolvedValue({
      ok: true,
      path: "uploaded.jpg",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("이미지와 메타가 유효하면 배너를 생성한다", async () => {
    const response = await POST(
      postRequest(bannerForm({ title: "오픈", linkUrl: "https://ex.com" })),
    );
    const body = (await response.json()) as { banner?: { imageUrl?: string; title?: string } };

    expect(response.status).toBe(201);
    expect(body.banner?.title).toBe("오픈");
    expect(body.banner?.imageUrl).toBe("https://test/uploaded.jpg");
    expect(uploadBannerImage).toHaveBeenCalledOnce();
  });

  it("이미지 파일이 없으면 400을 반환한다", async () => {
    const response = await POST(postRequest(bannerForm({ withImage: false })));
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("배너 이미지 파일이 필요합니다.");
    expect(uploadBannerImage).not.toHaveBeenCalled();
  });

  it("링크 URL이 http/https가 아니면 400을 반환한다", async () => {
    const response = await POST(
      postRequest(bannerForm({ linkUrl: "javascript:alert(1)" })),
    );
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("링크 URL은 http/https만 허용됩니다.");
  });

  it("이미지 업로드가 실패하면 400을 반환한다", async () => {
    vi.mocked(uploadBannerImage).mockResolvedValueOnce({
      ok: false,
      message: "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
    });
    const response = await POST(postRequest(bannerForm()));
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.");
  });

  it("인증이 없으면 401을 반환한다", async () => {
    setAdminAuthError(401, "관리자 인증이 필요합니다.");
    const response = await POST(postRequest(bannerForm()));
    expect(response.status).toBe(401);
  });

  it("admin claim이 없으면 403을 반환한다", async () => {
    setAdminAuthError(403, "관리자 권한이 없습니다.");
    const response = await POST(postRequest(bannerForm()));
    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/banners", () => {
  beforeEach(() => {
    setAdminAuthOk();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("배너 목록을 반환한다", async () => {
    await createBanner({
      imagePath: "a.jpg",
      meta: {
        linkUrl: null,
        title: "A",
        sortOrder: 0,
        isActive: true,
        startsAt: null,
        endsAt: null,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/admin/banners", {
      headers: { authorization: BEARER },
    });
    const response = await GET(request);
    const body = (await response.json()) as { banners?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.banners).toHaveLength(1);
  });
});
