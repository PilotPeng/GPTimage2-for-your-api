import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    await requireAdmin(request, config);
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "";
    return NextResponse.json({ users: getAppStore(config.appDbPath).searchUsers(query, 50) });
  } catch (error) {
    return createErrorResponse(error);
  }
}
