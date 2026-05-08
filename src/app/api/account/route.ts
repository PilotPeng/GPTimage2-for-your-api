import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getAccountSummary } from "@/lib/server/billing";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const user = await requireUser(request, config);
    return NextResponse.json(getAccountSummary(user.id, config));
  } catch (error) {
    return createErrorResponse(error);
  }
}
