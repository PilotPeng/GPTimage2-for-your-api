// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppStore, resetAppStoreCache } from "@/lib/server/appStore";
import { hashPassword } from "@/lib/server/auth";
import { finalizeGenerationCharge, refundGenerationCharge, reserveGenerationCredits } from "@/lib/server/billing";
import { resetImageJobStoreCache } from "@/lib/server/imageJobStore";
import type { ServerConfig } from "@/lib/server/config";

let tempDir = "";
let config: ServerConfig;
let userId = "";

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
  creditCostGenerate: 2,
  creditCostReference: 3,
  creditCostEdit: 4,
  paymentProvider: "alipay",
  paymentCurrency: "CNY",
  paymentPacks: [],
  alipayAppId: "",
  alipaySellerId: "",
  alipayPrivateKey: "",
  alipayPublicKey: "",
  alipayGatewayUrl: "https://openapi.alipay.com/gateway.do",
  manualPaymentQrUrl: "",
  manualPaymentTitle: "扫码付款后联系管理员加额度",
  manualPaymentDescription: "请备注注册邮箱或订单信息，管理员确认到账后会手动为你的账户添加额度。",
});

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-billing-"));
  config = createConfig();
  const user = getAppStore(config.appDbPath).createUser({
    email: "user@example.com",
    passwordHash: await hashPassword("password"),
    initialCredits: 5,
  });
  userId = user.id;
});

afterEach(() => {
  resetAppStoreCache();
  resetImageJobStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("billing", () => {
  it("reserves and finalizes generation credits", () => {
    reserveGenerationCredits({ userId, jobId: "job-billing-0001", mode: "generate", config });

    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(3);
    finalizeGenerationCharge("job-billing-0001", config);
    expect(getAppStore(config.appDbPath).getGenerationCharge("job-billing-0001")?.status).toBe("charged");
  });

  it("refunds failed generation once", () => {
    reserveGenerationCredits({ userId, jobId: "job-billing-0001", mode: "edit", config });
    refundGenerationCharge("job-billing-0001", config, "failed");
    refundGenerationCharge("job-billing-0001", config, "failed again");

    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(5);
    expect(getAppStore(config.appDbPath).getGenerationCharge("job-billing-0001")?.status).toBe("refunded");
  });

  it("rejects insufficient balance", () => {
    expect(() => reserveGenerationCredits({ userId, jobId: "job-billing-0001", mode: "edit", config })).not.toThrow();
    expect(() => reserveGenerationCredits({ userId, jobId: "job-billing-0002", mode: "edit", config })).toThrow("额度不足");
  });

  it("rejects stale terminal job id reuse after the image job expires", () => {
    reserveGenerationCredits({ userId, jobId: "job-billing-0001", mode: "generate", config });
    finalizeGenerationCharge("job-billing-0001", config);

    expect(() => reserveGenerationCredits({ userId, jobId: "job-billing-0001", mode: "generate", config })).toThrow("任务已过期");
    expect(getAppStore(config.appDbPath).getBalance(userId)).toBe(3);
  });
});
