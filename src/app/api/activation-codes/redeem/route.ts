import { NextResponse } from "next/server";
import { z } from "zod";
import { hashActivationCode, requireUser } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

const requestSchema = z.object({
  code: z.string().trim().min(8, "请输入有效激活码。"),
});

export async function POST(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const user = await requireUser(request, config);
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    return NextResponse.json(getAppStore(config.appDbPath).redeemActivationCode({
      codeHash: hashActivationCode(parsed.data.code, config),
      userId: user.id,
    }));
  } catch (error) {
    return createErrorResponse(error);
  }
}
