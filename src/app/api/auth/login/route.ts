import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithPassword, createSessionCookie } from "@/lib/server/auth";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";
import type { LoginResponse } from "@/lib/shared/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱。"),
  password: z.string().min(1, "请输入密码。"),
});

const getClientAddress = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")?.trim()
  || "unknown";

export async function POST(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    const session = await loginWithPassword(parsed.data.email, parsed.data.password, config, getClientAddress(request));
    const body: LoginResponse = {
      user: session.user,
      sessionExpiresAt: session.expiresAt,
    };
    const response = NextResponse.json(body);
    response.headers.set("Set-Cookie", createSessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return createErrorResponse(error);
  }
}
