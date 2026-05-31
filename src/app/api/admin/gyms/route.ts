import type { NextRequest } from "next/server";
import { validateAdminGymPayload } from "@/lib/admin/admin-gym-schema";
import { verifyAdminTokenFromRequest } from "@/lib/server/admin-auth";
import { serverErrorResponse } from "@/lib/server/api-error-response";
import {
  createAdminGym,
  listAdminGyms,
} from "@/lib/server/db-gym-admin-repository";
import {
  checkRateLimit,
  extractClientIp,
  rateLimitedJsonResponse,
} from "@/lib/server/rate-limit";

async function enforceAdminApiIpLimit(request: NextRequest) {
  return checkRateLimit({
    scope: "admin-api:ip",
    identifier: extractClientIp(request.headers),
    limit: 60,
    windowMs: 60_000,
  });
}

export const dynamic = "force-dynamic";

function mutationStatusCode(status: string): number {
  if (status === "duplicate") return 409;
  if (status === "not-found") return 404;
  if (status === "conflict") return 409;
  return 422;
}

export async function GET(request: NextRequest) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
  if (!auth.ok) {
    return Response.json({ message: auth.message }, { status: auth.status });
  }

  let gyms: Awaited<ReturnType<typeof listAdminGyms>>;
  try {
    gyms = await listAdminGyms();
  } catch (error) {
    return serverErrorResponse(
      "시설 목록을 불러오지 못했습니다.",
      "Failed to list admin gyms",
      error,
    );
  }
  return Response.json({ gyms });
}

export async function POST(request: NextRequest) {
  const ipLimit = await enforceAdminApiIpLimit(request);
  if (!ipLimit.ok) return rateLimitedJsonResponse(ipLimit);

  const auth = await verifyAdminTokenFromRequest(request);
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

  let result: Awaited<ReturnType<typeof createAdminGym>>;
  try {
    result = await createAdminGym(validation.input);
  } catch (error) {
    return serverErrorResponse(
      "시설을 추가하지 못했습니다.",
      "Failed to create admin gym",
      error,
    );
  }
  if (!result.ok) {
    return Response.json(
      { status: result.status, message: result.message },
      { status: mutationStatusCode(result.status) },
    );
  }

  return Response.json({ gym: result.gym, message: result.message });
}
