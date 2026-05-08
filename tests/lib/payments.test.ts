// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppStore, resetAppStoreCache } from "@/lib/server/appStore";
import { hashPassword } from "@/lib/server/auth";
import { createPaymentOrder, settleAlipayWebhook } from "@/lib/server/payments";
import type { ServerConfig } from "@/lib/server/config";

let tempDir = "";
let config: ServerConfig;
let privateKey = "";
let publicKey = "";
let userId = "";

const normalizeAlipayBody = (body: Record<string, string>) => Object.keys(body)
  .filter((key) => key !== "sign" && key !== "sign_type" && body[key] !== undefined && body[key] !== "")
  .sort()
  .map((key) => `${key}=${body[key]}`)
  .join("&");

const signAlipayParams = (params: Record<string, string>) => crypto
  .createSign("RSA-SHA256")
  .update(normalizeAlipayBody(params), "utf8")
  .sign(privateKey, "base64");

const createConfig = (): ServerConfig => ({
  uiMode: "configurable",
  siteAccessPassword: "",
  defaultApiKey: "",
  defaultApiBaseUrl: "https://api.example.com/v1",
  defaultModel: "gpt-image-2",
  authHeader: "Authorization",
  authScheme: "Bearer",
  requestTimeoutMs: 120_000,
  maxUploadBytes: 10_485_760,
  maxUploadCount: 4,
  maxTotalUploadBytes: 41_943_040,
  allowedImageMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  allowPrivateEndpoints: false,
  imageJobDbPath: path.join(tempDir, "jobs.sqlite"),
  imageJobConcurrency: 1,
  imageJobMaxPending: 20,
  imageJobResultTtlMs: 86_400_000,
  imageJobPollRetryMs: 2_000,
  billingEnabled: true,
  appDbPath: path.join(tempDir, "app.sqlite"),
  appBaseUrl: "http://localhost:3000",
  sessionSecret: "test-session-secret-that-is-long-enough",
  sessionTtlDays: 30,
  adminBootstrapEmail: "",
  adminBootstrapPassword: "",
  allowSelfRegistration: false,
  initialFreeCredits: 0,
  creditCostGenerate: 1,
  creditCostReference: 1,
  creditCostEdit: 1,
  paymentProvider: "alipay",
  paymentCurrency: "CNY",
  paymentPacks: [{ id: "starter", credits: 100, amountCents: 990, currency: "CNY", title: "入门包" }],
  alipayAppId: "app-123",
  alipaySellerId: "seller-123",
  alipayPrivateKey: privateKey,
  alipayPublicKey: publicKey,
  alipayGatewayUrl: "https://openapi.alipay.com/gateway.do",
});

const createWebhookBody = (overrides: Partial<Record<string, string>> = {}) => {
  const order = createPaymentOrder({ userId, packId: "starter", config });
  const params = {
    app_id: config.alipayAppId,
    seller_id: config.alipaySellerId,
    trade_no: `trade-${crypto.randomUUID()}`,
    out_trade_no: order.order.providerOrderId ?? order.order.id,
    trade_status: "TRADE_SUCCESS",
    total_amount: "9.90",
    ...overrides,
  };

  return new URLSearchParams({ ...params, sign_type: "RSA2", sign: signAlipayParams(params) }).toString();
};

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-payments-"));
  const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  config = createConfig();
  const user = getAppStore(config.appDbPath).createUser({
    email: "user@example.com",
    passwordHash: await hashPassword("password"),
    initialCredits: 0,
  });
  userId = user.id;
});

afterEach(() => {
  resetAppStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("payments", () => {
  it("settles valid Alipay webhooks", () => {
    const result = settleAlipayWebhook(createWebhookBody(), config);

    expect(result).toEqual({ processed: true });
    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(100);
  });

  it("rejects Alipay webhooks for a different app", () => {
    expect(() => settleAlipayWebhook(createWebhookBody({ app_id: "other-app" }), config)).toThrow("支付通知来源不匹配");
    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(0);
  });

  it("rejects Alipay webhooks for a different seller", () => {
    expect(() => settleAlipayWebhook(createWebhookBody({ seller_id: "other-seller" }), config)).toThrow("支付通知商户不匹配");
    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(0);
  });
});
