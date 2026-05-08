import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";
import { settleAlipayWebhook } from "@/lib/server/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = getServerConfig();

    if (!config.billingEnabled) {
      throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
    }

    if (config.paymentProvider !== "alipay") {
      throw new AppError(400, "PAYMENT_PROVIDER_UNSUPPORTED", "当前支付方式未启用。");
    }

    settleAlipayWebhook(await request.text(), config);
    return new NextResponse("success", { status: 200 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
