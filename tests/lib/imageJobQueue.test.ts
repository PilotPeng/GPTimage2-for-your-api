// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueImageJob, getImageJob, waitForImageJobWorker } from "@/lib/server/imageJobQueue";
import { resetImageJobStoreCache } from "@/lib/server/imageJobStore";
import type { ParsedImageRequest } from "@/lib/server/imageRequest";
import type { ServerConfig } from "@/lib/server/config";

vi.mock("@/lib/server/gptImage2Client", () => ({
  generateImage: vi.fn(),
}));

const { generateImage } = await import("@/lib/server/gptImage2Client");
const generateImageMock = vi.mocked(generateImage);

let tempDir = "";
let config: ServerConfig;

const createInput = (): ParsedImageRequest => ({
  prompt: "a cat",
  endpointUrl: "https://api.example.com/v1/images/generations",
  mode: "generate",
  apiKey: "secret-key",
  images: [],
});

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-job-queue-"));
  config = {
    uiMode: "configurable",
    siteAccessPassword: "",
    defaultApiKey: "server-key",
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
    billingEnabled: false,
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
    paymentPacks: [],
    alipayAppId: "",
    alipaySellerId: "",
    alipayPrivateKey: "",
    alipayPublicKey: "",
    alipayGatewayUrl: "https://openapi.alipay.com/gateway.do",
    manualPaymentQrUrl: "",
    manualPaymentTitle: "扫码付款后联系管理员加额度",
    manualPaymentDescription: "请备注注册邮箱或订单信息，管理员确认到账后会手动为你的账户添加额度。",
  };
  generateImageMock.mockResolvedValue({ images: [{ url: "https://cdn.example.com/result.png" }] });
});

afterEach(async () => {
  await waitForImageJobWorker();
  resetImageJobStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("imageJobQueue", () => {
  it("enqueues and completes image jobs", async () => {
    const createdJob = enqueueImageJob("queue-job-0001", createInput(), config);

    expect(createdJob.status).toBe("queued");

    await vi.waitFor(() => expect(getImageJob("queue-job-0001", config)).toMatchObject({
      status: "succeeded",
      result: { images: [{ url: "https://cdn.example.com/result.png" }] },
    }));
    expect(generateImageMock).toHaveBeenCalled();
  });

  it("stores failed job errors", async () => {
    generateImageMock.mockRejectedValue(new Error("network failed"));
    enqueueImageJob("queue-job-0001", createInput(), config);

    await vi.waitFor(() => expect(getImageJob("queue-job-0001", config)).toMatchObject({
      status: "failed",
      error: { code: "IMAGE_JOB_FAILED" },
    }));
  });
});
