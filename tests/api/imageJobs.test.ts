// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/images/route";
import { GET } from "@/app/api/images/jobs/[jobId]/route";
import { resetImageJobStoreCache } from "@/lib/server/imageJobStore";
import { waitForImageJobWorker } from "@/lib/server/imageJobQueue";

let tempDir = "";

const createRequest = (formData: FormData) => new Request("http://localhost/api/images", {
  method: "POST",
  body: formData,
});

const createBaseForm = () => {
  const formData = new FormData();
  formData.set("jobId", "api-job-0001");
  formData.set("prompt", "a watercolor mountain");
  formData.set("apiBaseUrl", "https://api.example.com/v1");
  formData.set("mode", "generate");
  formData.set("apiKey", "secret-key");
  return formData;
};

const createGetContext = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-api-jobs-"));
  process.env.IMAGE_JOB_DB_PATH = path.join(tempDir, "jobs.sqlite");
  process.env.ALLOW_PRIVATE_ENDPOINTS = "false";
  process.env.GPT_IMAGE2_UI_MODE = "configurable";
  process.env.GPT_IMAGE2_API_BASE_URL = "";
  process.env.GPT_IMAGE2_API_KEY = "";
  process.env.MAX_UPLOAD_BYTES = "10485760";
  process.env.MAX_UPLOAD_COUNT = "4";
  process.env.MAX_TOTAL_UPLOAD_BYTES = "41943040";
  process.env.SITE_ACCESS_PASSWORD = "";
});

afterEach(async () => {
  await waitForImageJobWorker();
  resetImageJobStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("GET /api/images/jobs/[jobId]", () => {
  it("returns completed job results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mime_type: "image/png" }] }), { status: 200 }),
    );

    const createResponse = await POST(createRequest(createBaseForm()));
    expect(createResponse.status).toBe(202);

    await vi.waitFor(async () => {
      const response = await GET(new Request("http://localhost/api/images/jobs/api-job-0001"), createGetContext("api-job-0001"));
      const body = await response.json();
      expect(body).toMatchObject({
        jobId: "api-job-0001",
        status: "succeeded",
        result: { images: [{ b64: "abc", mimeType: "image/png" }] },
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  it("returns 404 for unknown jobs", async () => {
    const response = await GET(new Request("http://localhost/api/images/jobs/missing-job-0001"), createGetContext("missing-job-0001"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("IMAGE_JOB_NOT_FOUND");
  });
});
