import type { NextRequest } from "next/server";
import { validateAdminGymPayload } from "@/lib/admin/admin-gym-schema";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import {
  createAdminGym,
  listAdminGyms,
} from "@/lib/server/mysql-gym-admin-repository";

export const dynamic = "force-dynamic";

function mutationStatusCode(status: string): number {
  if (status === "duplicate") return 409;
  if (status === "not-found") return 404;
  if (status === "conflict") return 409;
  return 422;
}

export async function GET(request: NextRequest) {
  const auth = verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  const gyms = await listAdminGyms();
  return Response.json({ gyms });
}

export async function POST(request: NextRequest) {
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

  const validation = validateAdminGymPayload(body, { requireId: true });
  if (!validation.ok) {
    return Response.json({ message: validation.message }, { status: 400 });
  }

  const result = await createAdminGym(validation.input);
  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: mutationStatusCode(result.status) },
    );
  }

  return Response.json({ gym: result.gym, message: result.message });
}
