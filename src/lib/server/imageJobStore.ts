import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AppError } from "./errors";
import type { ImageGenerationResponse, ImageJobStatus, ImageJobStatusResponse } from "@/lib/shared/types";
import type { ParsedImageRequest, UploadedImage } from "./imageRequest";

type ImageJobRequestData = Readonly<{
  prompt: string;
  endpointUrl: string;
  mode: ParsedImageRequest["mode"];
  apiKey?: string;
  model?: string;
  size?: string;
  quality?: string;
}>;

export type StoredImageJobInput = Readonly<{
  prompt: string;
  endpointUrl: string;
  mode: ParsedImageRequest["mode"];
  apiKey?: string;
  model?: string;
  size?: string;
  quality?: string;
  images: readonly Omit<UploadedImage, "file">[];
}>;

type ImageJobRow = Readonly<{
  id: string;
  status: ImageJobStatus;
  prompt: string;
  mode: ParsedImageRequest["mode"];
  request_json: string | null;
  result_json: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
}>;

type ImageJobUploadRow = Readonly<{
  position: number;
  filename: string;
  mime_type: string;
  size: number;
  bytes: Buffer;
}>;

export type ClaimedImageJob = Readonly<{
  id: string;
  input: ParsedImageRequest;
}>;

const validJobStatuses = new Set<ImageJobStatus>(["queued", "running", "succeeded", "failed"]);

const toIsoString = (timeMs: number) => new Date(timeMs).toISOString();

const serializeRequest = (input: ParsedImageRequest): ImageJobRequestData => ({
  prompt: input.prompt,
  endpointUrl: input.endpointUrl,
  mode: input.mode,
  ...(input.apiKey ? { apiKey: input.apiKey } : {}),
  ...(input.model ? { model: input.model } : {}),
  ...(input.size ? { size: input.size } : {}),
  ...(input.quality ? { quality: input.quality } : {}),
});

const parseRequest = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as Partial<ImageJobRequestData>;

  if (
    typeof parsed.prompt !== "string" ||
    typeof parsed.endpointUrl !== "string" ||
    (parsed.mode !== "generate" && parsed.mode !== "reference" && parsed.mode !== "edit")
  ) {
    return undefined;
  }

  return parsed as ImageJobRequestData;
};

const parseResult = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as Partial<ImageGenerationResponse>;
  return Array.isArray(parsed.images) ? parsed as ImageGenerationResponse : undefined;
};

const toPublicStatus = (row: ImageJobRow, retryAfterMs: number): ImageJobStatusResponse => ({
  jobId: row.id,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  retryAfterMs,
  ...(row.status === "succeeded" && row.result_json ? { result: parseResult(row.result_json) } : {}),
  ...(row.status === "failed" ? {
    error: {
      code: row.error_code ?? "IMAGE_JOB_FAILED",
      message: row.error_message ?? "生成失败，请稍后重试。",
    },
  } : {}),
});

export class ImageJobStore {
  private readonly database: Database.Database;

  constructor(private readonly databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.initializeSchema();
  }

  close() {
    this.database.close();
  }

  enqueue(input: ParsedImageRequest, options: Readonly<{
    jobId: string;
    maxPending: number;
    resultTtlMs: number;
    retryAfterMs: number;
  }>) {
    const existing = this.getJob(options.jobId, options.retryAfterMs);

    if (existing) {
      return existing;
    }

    const pendingCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM image_jobs WHERE status IN ('queued', 'running')")
      .get() as { count: number };

    if (pendingCount.count >= options.maxPending) {
      throw new AppError(429, "TOO_MANY_PENDING_JOBS", "当前生成任务较多，请稍后再试。");
    }

    const now = Date.now();
    const createdAt = toIsoString(now);
    const expiresAt = toIsoString(now + options.resultTtlMs);
    const insertJob = this.database.prepare(`
      INSERT INTO image_jobs (
        id, status, prompt, mode, request_json, result_json, error_code, error_message,
        attempts, created_at, updated_at, started_at, finished_at, expires_at
      ) VALUES (
        @id, 'queued', @prompt, @mode, @requestJson, NULL, NULL, NULL,
        0, @createdAt, @createdAt, NULL, NULL, @expiresAt
      )
    `);
    const insertUpload = this.database.prepare(`
      INSERT INTO image_job_uploads (job_id, position, filename, mime_type, size, bytes)
      VALUES (@jobId, @position, @filename, @mimeType, @size, @bytes)
    `);

    this.database.transaction(() => {
      insertJob.run({
        id: options.jobId,
        prompt: input.prompt,
        mode: input.mode,
        requestJson: JSON.stringify(serializeRequest(input)),
        createdAt,
        expiresAt,
      });

      input.images.forEach((image, position) => {
        insertUpload.run({
          jobId: options.jobId,
          position,
          filename: image.filename,
          mimeType: image.mimeType,
          size: image.size,
          bytes: Buffer.from(image.bytes),
        });
      });
    })();

    return this.getJob(options.jobId, options.retryAfterMs);
  }

  getJob(jobId: string, retryAfterMs: number) {
    const row = this.getJobRow(jobId);
    return row ? toPublicStatus(row, retryAfterMs) : undefined;
  }

  claimNextJob(): ClaimedImageJob | undefined {
    const row = this.database
      .prepare("SELECT * FROM image_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
      .get() as ImageJobRow | undefined;

    if (!row) {
      return undefined;
    }

    const request = parseRequest(row.request_json);

    if (!request) {
      this.markFailed(row.id, "IMAGE_JOB_EXPIRED", "任务数据已过期，请重新提交。", 86_400_000);
      return undefined;
    }

    const now = toIsoString(Date.now());
    const updated = this.database.prepare(`
      UPDATE image_jobs
      SET status = 'running', attempts = attempts + 1, started_at = @now, updated_at = @now
      WHERE id = @id AND status = 'queued'
    `).run({ id: row.id, now });

    if (updated.changes === 0) {
      return undefined;
    }

    const uploads = this.database
      .prepare("SELECT position, filename, mime_type, size, bytes FROM image_job_uploads WHERE job_id = ? ORDER BY position ASC")
      .all(row.id) as ImageJobUploadRow[];

    return {
      id: row.id,
      input: {
        prompt: request.prompt,
        endpointUrl: request.endpointUrl,
        mode: request.mode,
        images: uploads.map((upload) => ({
          bytes: upload.bytes.buffer.slice(upload.bytes.byteOffset, upload.bytes.byteOffset + upload.bytes.byteLength) as ArrayBuffer,
          filename: upload.filename,
          mimeType: upload.mime_type,
          size: upload.size,
        })),
        ...(request.apiKey ? { apiKey: request.apiKey } : {}),
        ...(request.model ? { model: request.model } : {}),
        ...(request.size ? { size: request.size } : {}),
        ...(request.quality ? { quality: request.quality } : {}),
      },
    };
  }

  markSucceeded(jobId: string, result: ImageGenerationResponse, resultTtlMs: number) {
    const nowMs = Date.now();
    const now = toIsoString(nowMs);
    const expiresAt = toIsoString(nowMs + resultTtlMs);

    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE image_jobs
        SET status = 'succeeded', result_json = @resultJson, request_json = NULL,
            error_code = NULL, error_message = NULL, updated_at = @now, finished_at = @now, expires_at = @expiresAt
        WHERE id = @id
      `).run({ id: jobId, resultJson: JSON.stringify(result), now, expiresAt });
      this.database.prepare("DELETE FROM image_job_uploads WHERE job_id = ?").run(jobId);
    })();
  }

  markFailed(jobId: string, code: string, message: string, resultTtlMs: number) {
    const nowMs = Date.now();
    const now = toIsoString(nowMs);
    const expiresAt = toIsoString(nowMs + resultTtlMs);

    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE image_jobs
        SET status = 'failed', request_json = NULL, error_code = @code, error_message = @message,
            updated_at = @now, finished_at = @now, expires_at = @expiresAt
        WHERE id = @id
      `).run({ id: jobId, code, message, now, expiresAt });
      this.database.prepare("DELETE FROM image_job_uploads WHERE job_id = ?").run(jobId);
    })();
  }

  requeueStaleRunning(staleBeforeIso: string) {
    this.database.prepare(`
      UPDATE image_jobs
      SET status = 'queued', updated_at = @now, started_at = NULL
      WHERE status = 'running' AND updated_at < @staleBefore AND request_json IS NOT NULL
    `).run({ staleBefore: staleBeforeIso, now: toIsoString(Date.now()) });

    this.database.prepare(`
      UPDATE image_jobs
      SET status = 'failed', error_code = 'IMAGE_JOB_EXPIRED', error_message = '任务数据已过期，请重新提交。', updated_at = @now, finished_at = @now
      WHERE status = 'running' AND updated_at < @staleBefore AND request_json IS NULL
    `).run({ staleBefore: staleBeforeIso, now: toIsoString(Date.now()) });
  }

  cleanupExpired() {
    const now = toIsoString(Date.now());
    const expiredRows = this.database
      .prepare("SELECT id FROM image_jobs WHERE status IN ('succeeded', 'failed') AND expires_at < ?")
      .all(now) as { id: string }[];

    this.database.transaction(() => {
      for (const row of expiredRows) {
        this.database.prepare("DELETE FROM image_job_uploads WHERE job_id = ?").run(row.id);
        this.database.prepare("DELETE FROM image_jobs WHERE id = ?").run(row.id);
      }
    })();
  }

  private getJobRow(jobId: string) {
    const row = this.database.prepare("SELECT * FROM image_jobs WHERE id = ?").get(jobId) as ImageJobRow | undefined;

    if (!row || !validJobStatuses.has(row.status)) {
      return undefined;
    }

    return row;
  }

  private initializeSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS image_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        mode TEXT NOT NULL,
        request_json TEXT,
        result_json TEXT,
        error_code TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS image_job_uploads (
        job_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        bytes BLOB NOT NULL,
        PRIMARY KEY (job_id, position),
        FOREIGN KEY (job_id) REFERENCES image_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_image_jobs_status_created_at ON image_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_image_jobs_expires_at ON image_jobs(expires_at);
    `);
  }
}

const storeCache = new Map<string, ImageJobStore>();

export const getImageJobStore = (databasePath: string) => {
  const cachedStore = storeCache.get(databasePath);

  if (cachedStore) {
    return cachedStore;
  }

  const store = new ImageJobStore(databasePath);
  storeCache.set(databasePath, store);
  return store;
};

export const resetImageJobStoreCache = () => {
  for (const store of storeCache.values()) {
    store.close();
  }

  storeCache.clear();
};
