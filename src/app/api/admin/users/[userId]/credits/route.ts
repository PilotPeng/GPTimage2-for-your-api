import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ userId: string }>;
}>;

const requestSchema = z.object({
  delta: z.coerce.number().int(),
  memo: z.string().trim().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const admin = await requireAdmin(request, config);
    const { userId } = await context.params;
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success || parsed.data.delta === 0) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error?.issues[0]?.message ?? "额度调整必须不为 0。");
    }

    const store = getAppStore(config.appDbPath);
    const ledger = store.addCredits({
      userId,
      delta: parsed.data.delta,
      type: parsed.data.delta > 0 ? "admin_credit" : "admin_debit",
      referenceType: "admin_adjustment",
      referenceId: admin.id,
      idempotencyKey: `admin:${admin.id}:${userId}:${Date.now()}`,
      memo: parsed.data.memo ?? "管理员调整额度",
      createdBy: admin.id,
    });

    return NextResponse.json({ balance: ledger.balanceAfter, ledger });
  } catch (error) {
    return createErrorResponse(error);
  }
}
