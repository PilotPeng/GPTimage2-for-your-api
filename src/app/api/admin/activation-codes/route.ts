import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashActivationCode, requireAdmin } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

const requestSchema = z.object({
  credits: z.coerce.number().int().positive(),
  maxRedemptions: z.coerce.number().int().positive().optional().default(1),
  expiresAt: z.string().trim().optional(),
});

const createActivationCode = () => crypto.randomBytes(18).toString("base64url").toUpperCase();

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    await requireAdmin(request, config);
    return NextResponse.json({ activationCodes: getAppStore(config.appDbPath).listActivationCodes(100) });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const admin = await requireAdmin(request, config);
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    const code = createActivationCode();
    const activationCode = getAppStore(config.appDbPath).createActivationCode({
      codeHash: hashActivationCode(code, config),
      credits: parsed.data.credits,
      maxRedemptions: parsed.data.maxRedemptions,
      expiresAt: parsed.data.expiresAt,
      createdBy: admin.id,
    });

    if (!activationCode) {
      throw new AppError(500, "ACTIVATION_CODE_CREATE_FAILED", "创建激活码失败。");
    }

    return NextResponse.json({ code, activationCode });
  } catch (error) {
    return createErrorResponse(error);
  }
}
