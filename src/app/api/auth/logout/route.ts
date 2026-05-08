import { NextResponse } from "next/server";
import { createExpiredSessionCookie, logoutRequest } from "@/lib/server/auth";
import { getServerConfig } from "@/lib/server/config";
import { createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

export function POST(request: Request) {
  try {
    const config = getServerConfig();
    logoutRequest(request, config);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", createExpiredSessionCookie());
    return response;
  } catch (error) {
    return createErrorResponse(error);
  }
}
