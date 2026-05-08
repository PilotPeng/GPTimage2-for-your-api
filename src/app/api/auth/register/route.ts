import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, registerWithPassword } from "@/lib/server/auth";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";
import type { RegisterResponse } from "@/lib/shared/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱。"),
  password: z.string().min(8, "密码至少需要 8 位。").max(128, "密码过长。"),
});

export async function POST(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled || !config.allowSelfRegistration) {
      throw new AppError(404, "REGISTRATION_DISABLED", "暂未开放注册。");
    }

    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    const session = await registerWithPassword(parsed.data.email, parsed.data.password, config);
    const body: RegisterResponse = {
      user: session.user,
      sessionExpiresAt: session.expiresAt,
    };
    const response = NextResponse.json(body, { status: 201 });
    response.headers.set("Set-Cookie", createSessionCookie(session.token, session.expiresAt, config));
    return response;
  } catch (error) {
    return createErrorResponse(error);
  }
}
