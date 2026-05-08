// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionCookie, getAuthState, hashPassword, loginWithPassword, resetLoginAttemptStateForTests, verifyPassword } from "@/lib/server/auth";
import { getAppStore, resetAppStoreCache } from "@/lib/server/appStore";
import type { ServerConfig } from "@/lib/server/config";

let tempDir = "";
let config: ServerConfig;

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
  adminBootstrapEmail: "admin@example.com",
  adminBootstrapPassword: "password123",
  allowSelfRegistration: false,
  initialFreeCredits: 5,
  creditCostGenerate: 1,
  creditCostReference: 1,
  creditCostEdit: 1,
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

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-auth-"));
  config = createConfig();
});

afterEach(() => {
  resetLoginAttemptStateForTests();
  resetAppStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("auth", () => {
  it("hashes and verifies passwords", async () => {
    const passwordHash = await hashPassword("secret");

    expect(await verifyPassword("secret", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", passwordHash)).toBe(false);
  });

  it("bootstraps admin and reads session state", async () => {
    const session = await loginWithPassword("admin@example.com", "password123", config);
    const cookie = createSessionCookie(session.token, session.expiresAt, config).split(";")[0];
    const authState = await getAuthState(new Request("http://localhost/api/auth/me", { headers: { cookie } }), config);

    expect(authState.authenticated).toBe(true);
    expect(authState.user).toMatchObject({ email: "admin@example.com", role: "admin" });
    expect(getAppStore(config.appDbPath).getBalance(session.user.id)).toBe(5);
  });

  it("rate limits repeated failed logins", async () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      await expect(loginWithPassword("admin@example.com", `wrong-${attempt}`, config, "127.0.0.1")).rejects.toThrow("邮箱或密码不正确");
    }

    await expect(loginWithPassword("admin@example.com", "password123", config, "127.0.0.1")).rejects.toThrow("登录失败次数过多");
  });
});
