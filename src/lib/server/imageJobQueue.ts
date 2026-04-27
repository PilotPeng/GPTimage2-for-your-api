import { AppError } from "./errors";
import { generateImage } from "./gptImage2Client";
import { getImageJobStore } from "./imageJobStore";
import type { ImageJobCreateResponse, ImageJobStatusResponse } from "@/lib/shared/types";
import type { ParsedImageRequest } from "./imageRequest";
import type { ServerConfig } from "./config";

type ImageJobWorkerState = {
  running: boolean;
  activeCount: number;
  staleJobsRecovered: boolean;
  currentRun?: Promise<void>;
};

type GlobalImageJobWorker = typeof globalThis & {
  __gptImage2JobWorkerState?: ImageJobWorkerState;
};

const getWorkerState = () => {
  const globalWorker = globalThis as GlobalImageJobWorker;

  globalWorker.__gptImage2JobWorkerState ??= {
    running: false,
    activeCount: 0,
    staleJobsRecovered: false,
  };

  return globalWorker.__gptImage2JobWorkerState;
};

export const createImageJobId = () => {
  const runtimeCrypto = globalThis.crypto;

  if (typeof runtimeCrypto?.randomUUID === "function") {
    return runtimeCrypto.randomUUID();
  }

  if (typeof runtimeCrypto?.getRandomValues === "function") {
    const values = runtimeCrypto.getRandomValues(new Uint32Array(4));
    return Array.from(values, (value) => value.toString(36).padStart(7, "0")).join("-");
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const isSafeImageJobId = (jobId: string) => /^[a-zA-Z0-9_-]{12,80}$/.test(jobId);

const buildStatusUrl = (jobId: string) => `api/images/jobs/${encodeURIComponent(jobId)}`;

const getJobConfig = (config: ServerConfig) => ({
  maxPending: config.imageJobMaxPending,
  resultTtlMs: config.imageJobResultTtlMs,
  retryAfterMs: config.imageJobPollRetryMs,
});

const recoverStaleJobs = (config: ServerConfig) => {
  const workerState = getWorkerState();

  if (workerState.staleJobsRecovered) {
    return;
  }

  const staleBefore = new Date(Date.now() - config.requestTimeoutMs - 30_000).toISOString();
  getImageJobStore(config.imageJobDbPath).requeueStaleRunning(staleBefore);
  workerState.staleJobsRecovered = true;
};

const toCreateResponse = (job: ImageJobStatusResponse): ImageJobCreateResponse => ({
  jobId: job.jobId,
  status: job.status,
  statusUrl: buildStatusUrl(job.jobId),
  retryAfterMs: job.retryAfterMs,
});

export const enqueueImageJob = (
  jobId: string,
  input: ParsedImageRequest,
  config: ServerConfig,
) => {
  if (!isSafeImageJobId(jobId)) {
    throw new AppError(400, "INVALID_JOB_ID", "任务 ID 无效，请重新提交。");
  }

  recoverStaleJobs(config);
  const store = getImageJobStore(config.imageJobDbPath);
  store.cleanupExpired();
  const job = store.enqueue(input, { jobId, ...getJobConfig(config) });

  if (!job) {
    throw new AppError(500, "IMAGE_JOB_CREATE_FAILED", "创建生成任务失败，请稍后重试。");
  }

  wakeImageJobWorker(config);
  return toCreateResponse(job);
};

export const getImageJob = (jobId: string, config: ServerConfig) => {
  if (!isSafeImageJobId(jobId)) {
    throw new AppError(400, "INVALID_JOB_ID", "任务 ID 无效。");
  }

  recoverStaleJobs(config);
  const store = getImageJobStore(config.imageJobDbPath);
  store.cleanupExpired();
  return store.getJob(jobId, config.imageJobPollRetryMs);
};

const processOneJob = async (config: ServerConfig) => {
  const store = getImageJobStore(config.imageJobDbPath);
  const job = store.claimNextJob();

  if (!job) {
    return false;
  }

  try {
    const result = await generateImage(job.input, {
      defaultApiKey: config.defaultApiKey,
      defaultModel: job.input.model ?? config.defaultModel,
      authHeader: config.authHeader,
      authScheme: config.authScheme,
      requestTimeoutMs: config.requestTimeoutMs,
    });
    store.markSucceeded(job.id, result, config.imageJobResultTtlMs);
  } catch (error) {
    if (error instanceof AppError) {
      store.markFailed(job.id, error.code, error.message, config.imageJobResultTtlMs);
    } else {
      store.markFailed(job.id, "IMAGE_JOB_FAILED", "生成失败，请稍后重试。", config.imageJobResultTtlMs);
    }
  }

  return true;
};

const runWorker = async (config: ServerConfig) => {
  const workerState = getWorkerState();

  if (workerState.running) {
    return workerState.currentRun;
  }

  workerState.running = true;
  workerState.currentRun = (async () => {
    try {
      while (workerState.activeCount < config.imageJobConcurrency) {
        workerState.activeCount += 1;
        const processedJob = await processOneJob(config);
        workerState.activeCount -= 1;

        if (!processedJob) {
          break;
        }
      }
    } finally {
      workerState.running = false;
      workerState.currentRun = undefined;
    }
  })();

  return workerState.currentRun;
};

export const wakeImageJobWorker = (config: ServerConfig) => {
  void runWorker(config);
};

export const waitForImageJobWorker = async () => {
  await getWorkerState().currentRun;
};
