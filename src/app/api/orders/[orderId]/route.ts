import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getAppStore } from "@/lib/server/appStore";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ orderId: string }>;
}>;

export async function GET(request: Request, context: RouteContext) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    const user = await requireUser(request, config);
    const { orderId } = await context.params;
    const order = getAppStore(config.appDbPath).getOrderById(orderId, user.id);

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "订单不存在。");
    }

    return NextResponse.json({ order });
  } catch (error) {
    return createErrorResponse(error);
  }
}
