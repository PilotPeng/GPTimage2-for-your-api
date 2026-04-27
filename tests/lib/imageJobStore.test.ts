// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageJobStore } from "@/lib/server/imageJobStore";
import type { ParsedImageRequest, UploadedImage } from "@/lib/server/imageRequest";

let tempDir = "";
let store: ImageJobStore;

const createUploadedImage = (content: string): UploadedImage => ({
  file: new File([content], "image.png", { type: "image/png" }),
  bytes: new TextEncoder().encode(content).buffer,
  filename: "image.png",
  mimeType: "image/png",
  size: content.length,
});

const createInput = (prompt = "a cat"): ParsedImageRequest => ({
  prompt,
  endpointUrl: "https://api.example.com/v1/images/generations",
  mode: "generate",
  apiKey: "secret-key",
  images: [],
});

const options = {
  maxPending: 20,
  resultTtlMs: 86_400_000,
  retryAfterMs: 2_000,
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-job-store-"));
  store = new ImageJobStore(path.join(tempDir, "jobs.sqlite"));
});

afterEach(() => {
  store.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ImageJobStore", () => {
  it("enqueues and returns job status", () => {
    const job = store.enqueue(createInput(), { ...options, jobId: "job-store-0001" });

    expect(job).toMatchObject({
      jobId: "job-store-0001",
      status: "queued",
      retryAfterMs: 2_000,
    });
  });

  it("claims queued jobs in FIFO order", () => {
    store.enqueue(createInput("first"), { ...options, jobId: "job-store-0001" });
    store.enqueue(createInput("second"), { ...options, jobId: "job-store-0002" });

    expect(store.claimNextJob()?.input.prompt).toBe("first");
    expect(store.claimNextJob()?.input.prompt).toBe("second");
  });

  it("stores uploads until completion and scrubs payload after success", () => {
    store.enqueue({ ...createInput(), mode: "reference", images: [createUploadedImage("image")] }, { ...options, jobId: "job-store-0001" });

    const claimedJob = store.claimNextJob();
    expect(claimedJob?.input.images).toHaveLength(1);

    store.markSucceeded("job-store-0001", { images: [{ url: "https://cdn.example.com/result.png" }] }, options.resultTtlMs);

    expect(store.getJob("job-store-0001", options.retryAfterMs)).toMatchObject({
      status: "succeeded",
      result: { images: [{ url: "https://cdn.example.com/result.png" }] },
    });
    expect(store.claimNextJob()).toBeUndefined();
  });

  it("persists jobs across store instances", () => {
    const databasePath = path.join(tempDir, "jobs.sqlite");
    store.enqueue(createInput(), { ...options, jobId: "job-store-0001" });
    store.close();
    store = new ImageJobStore(databasePath);

    expect(store.getJob("job-store-0001", options.retryAfterMs)?.status).toBe("queued");
  });

  it("cleans up expired terminal jobs", () => {
    store.enqueue(createInput(), { ...options, jobId: "job-store-0001", resultTtlMs: 1 });
    store.claimNextJob();
    store.markFailed("job-store-0001", "FAILED", "failed", 1);

    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 10_000;
    store.cleanupExpired();
    Date.now = originalDateNow;

    expect(store.getJob("job-store-0001", options.retryAfterMs)).toBeUndefined();
  });
});
