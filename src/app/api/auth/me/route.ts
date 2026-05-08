import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/server/auth";
import { getServerConfig } from "@/lib/server/config";
import { createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = getServerConfig();
    return NextResponse.json(await getAuthState(request, config));
  } catch (error) {
    return createErrorResponse(error);
  }
}
