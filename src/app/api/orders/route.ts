import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";
import { createPaymentOrder, listPaymentPacks } from "@/lib/server/payments";

export const runtime = "nodejs";

const requestSchema = z.object({
  packId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const user = await requireUser(request, config);
    return NextResponse.json({
      packs: listPaymentPacks(config),
      orders: getAppStore(config.appDbPath).listOrders(user.id, 50),
      manualPayment: {
        enabled: Boolean(config.manualPaymentQrUrl),
        qrImageUrl: config.manualPaymentQrUrl,
        title: config.manualPaymentTitle,
        description: config.manualPaymentDescription,
      },
    });
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

    const user = await requireUser(request, config);
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    return NextResponse.json(createPaymentOrder({ userId: user.id, packId: parsed.data.packId, config }));
  } catch (error) {
    return createErrorResponse(error);
  }
}
