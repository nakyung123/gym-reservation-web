import type { NextRequest } from "next/server";
import { validateAdminGymPayload } from "@/lib/admin/admin-gym-schema";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { updateAdminGym } from "@/lib/server/mysql-gym-admin-repository";

export const dynamic = "force-dynamic";

function mutationStatusCode(status: string): number {
  if (status === "not-found") return 404;
  if (status === "conflict" || status === "duplicate") return 409;
  return 422;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ gymId: string }> },
) {
  const auth = verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "요청 본문이 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  const validation = validateAdminGymPayload(body, { requireId: false });
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const { gymId } = await params;
  const result = await updateAdminGym(gymId, validation.input);
  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: mutationStatusCode(result.status) },
    );
  }

  return Response.json({ gym: result.gym, message: result.message });
}
