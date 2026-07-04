import type { NextRequest } from "next/server";
import { verifyIdTokenFromRequest } from "@/lib/server/auth";
import {
  createInquiryInDb,
  listUserInquiries,
} from "@/lib/server/db-inquiry-repository";
import { gymRepository } from "@/lib/gym-repository-provider";
import { validateInquiryInput } from "@/lib/inquiry";
import { serverErrorResponse } from "@/lib/server/api-error-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const pageParam = request.nextUrl.searchParams.get("page");
  const page = pageParam ? Number(pageParam) : 1;

  let result: Awaited<ReturnType<typeof listUserInquiries>>;
  try {
    result = await listUserInquiries(auth.uid, {
      page: Number.isFinite(page) ? page : 1,
    });
  } catch (error) {
    return serverErrorResponse(
      "문의 목록을 불러오지 못했습니다.",
      "Failed to list user inquiries",
      error,
    );
  }
  return Response.json({
    ok: true,
    inquiries: result.inquiries,
    total: result.total,
  });
}

type CreateBody = {
  title?: unknown;
  body?: unknown;
  gymId?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await verifyIdTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json(
      { ok: false, message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateInquiryInput({
    title: typeof body.title === "string" ? body.title : "",
    body: typeof body.body === "string" ? body.body : "",
    gymId: body.gymId,
  });
  if (!validation.ok) {
    return Response.json(
      { ok: false, message: validation.message },
      { status: 400 },
    );
  }

  // gymId가 있으면 실재 시설인지 확인(없는 시설 참조 차단).
  if (validation.input.gymId !== null) {
    let gym: Awaited<ReturnType<typeof gymRepository.findById>>;
    try {
      gym = await gymRepository.findById(validation.input.gymId);
    } catch (error) {
      return serverErrorResponse(
        "시설 정보를 확인하지 못했습니다.",
        "Failed to verify gym for inquiry",
        error,
      );
    }
    if (!gym) {
      return Response.json(
        { ok: false, message: "존재하지 않는 시설입니다." },
        { status: 400 },
      );
    }
  }

  let result: Awaited<ReturnType<typeof createInquiryInDb>>;
  try {
    result = await createInquiryInDb({
      userId: auth.uid,
      title: validation.input.title,
      body: validation.input.body,
      gymId: validation.input.gymId,
    });
  } catch (error) {
    return serverErrorResponse(
      "문의 등록에 실패했습니다.",
      "Failed to create inquiry",
      error,
    );
  }

  return Response.json({ ok: true, inquiry: result.inquiry }, { status: 201 });
}
