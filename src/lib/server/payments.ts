import crypto from "node:crypto";
import { AppError } from "./errors";
import { getAppStore } from "./appStore";
import type { CreateOrderResponse, PaymentPack, PaymentProvider } from "@/lib/shared/types";
import type { ServerConfig } from "./config";

const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const toIsoString = (timeMs: number) => new Date(timeMs).toISOString();
const normalizeCurrency = (currency: string) => currency.trim().toUpperCase();
const normalizeAlipayBody = (body: Record<string, string>, options: Readonly<{ includeSignType: boolean }>) => Object.keys(body)
  .filter((key) => key !== "sign" && (options.includeSignType || key !== "sign_type") && body[key] !== undefined && body[key] !== "")
  .sort()
  .map((key) => `${key}=${body[key]}`)
  .join("&");

const parseFormBody = (rawBody: string) => Object.fromEntries(new URLSearchParams(rawBody).entries());

const centsToAmount = (amountCents: number) => (amountCents / 100).toFixed(2);
const amountToCents = (amount: string) => Math.round(Number.parseFloat(amount) * 100);

const assertAlipayConfigured = (config: ServerConfig) => {
  if (!config.alipayAppId || !config.alipaySellerId || !config.alipayPrivateKey || !config.alipayPublicKey || !config.appBaseUrl) {
    throw new AppError(500, "ALIPAY_CONFIG_REQUIRED", "服务器未配置完整支付宝参数。");
  }
};

const assertAlipayWebhookOwner = (params: Record<string, string>, config: ServerConfig) => {
  if (params.app_id !== config.alipayAppId) {
    throw new AppError(400, "PAYMENT_APP_MISMATCH", "支付通知来源不匹配。");
  }

  if (params.seller_id !== config.alipaySellerId) {
    throw new AppError(400, "PAYMENT_SELLER_MISMATCH", "支付通知商户不匹配。");
  }
};

const findPack = (packId: string, config: ServerConfig) => {
  const pack = config.paymentPacks.find((paymentPack) => paymentPack.id === packId);

  if (!pack) {
    throw new AppError(400, "INVALID_PAYMENT_PACK", "充值套餐不存在。");
  }

  if (normalizeCurrency(pack.currency) !== normalizeCurrency(config.paymentCurrency)) {
    throw new AppError(500, "PAYMENT_PACK_CURRENCY_INVALID", "充值套餐币种配置不一致。");
  }

  return pack;
};

const createAlipaySignature = (params: Record<string, string>, privateKey: string) => crypto
  .createSign("RSA-SHA256")
  .update(normalizeAlipayBody(params, { includeSignType: true }), "utf8")
  .sign(privateKey, "base64");

const verifyAlipaySignature = (params: Record<string, string>, publicKey: string) => {
  const signature = params.sign;

  if (!signature) {
    return false;
  }

  return crypto
    .createVerify("RSA-SHA256")
    .update(normalizeAlipayBody(params, { includeSignType: false }), "utf8")
    .verify(publicKey, signature, "base64");
};

const buildAlipayCheckoutUrl = (orderId: string, pack: PaymentPack, config: ServerConfig) => {
  assertAlipayConfigured(config);

  const bizContent = JSON.stringify({
    out_trade_no: orderId,
    total_amount: centsToAmount(pack.amountCents),
    subject: pack.title ?? `GPT-image2 ${pack.credits}额度充值`,
    product_code: "FAST_INSTANT_TRADE_PAY",
  });
  const params: Record<string, string> = {
    app_id: config.alipayAppId,
    method: "alipay.trade.page.pay",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    version: "1.0",
    notify_url: `${config.appBaseUrl.replace(/\/$/, "")}/api/payments/webhook`,
    return_url: `${config.appBaseUrl.replace(/\/$/, "")}/orders`,
    biz_content: bizContent,
  };
  const signedParams = new URLSearchParams({
    ...params,
    sign: createAlipaySignature(params, config.alipayPrivateKey),
  });

  return `${config.alipayGatewayUrl}?${signedParams.toString()}`;
};

export const listPaymentPacks = (config: ServerConfig) => config.paymentPacks;

export const createPaymentOrder = (input: Readonly<{
  userId: string;
  packId: string;
  config: ServerConfig;
}>): CreateOrderResponse => {
  if (!input.config.billingEnabled) {
    throw new AppError(404, "BILLING_DISABLED", "付费模式未启用。");
  }

  const pack = findPack(input.packId, input.config);
  const orderId = createId("order");
  const checkoutUrl = input.config.paymentProvider === "alipay"
    ? buildAlipayCheckoutUrl(orderId, pack, input.config)
    : "";
  const order = getAppStore(input.config.appDbPath).createOrder({
    id: orderId,
    userId: input.userId,
    provider: input.config.paymentProvider,
    providerOrderId: orderId,
    pack,
    checkoutUrl,
    expiresAt: toIsoString(Date.now() + 30 * 60_000),
  });

  return { order, checkoutUrl };
};

export const settleAlipayWebhook = (rawBody: string, config: ServerConfig) => {
  assertAlipayConfigured(config);

  const params = parseFormBody(rawBody);

  if (!verifyAlipaySignature(params, config.alipayPublicKey)) {
    throw new AppError(400, "PAYMENT_SIGNATURE_INVALID", "支付通知签名无效。");
  }

  assertAlipayWebhookOwner(params, config);

  if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
    return { processed: false } as const;
  }

  const providerOrderId = params.out_trade_no;
  const providerEventId = params.trade_no;
  const amount = params.total_amount;

  if (!providerOrderId || !providerEventId || !amount) {
    throw new AppError(400, "PAYMENT_WEBHOOK_INVALID", "支付通知参数不完整。");
  }

  return getAppStore(config.appDbPath).settlePaidOrder({
    provider: "alipay" satisfies PaymentProvider,
    providerOrderId,
    amountCents: amountToCents(amount),
    currency: config.paymentCurrency,
    event: {
      id: createId("event"),
      provider: "alipay",
      providerEventId,
      eventType: params.trade_status,
      payloadJson: JSON.stringify(params),
    },
  });
};
