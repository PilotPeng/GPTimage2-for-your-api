export const imageModes = ["generate", "reference", "edit"] as const;
export const uiModes = ["configurable", "sealed"] as const;

export type ImageMode = (typeof imageModes)[number];
export type UiMode = (typeof uiModes)[number];

export type GeneratedImage = Readonly<{
  url?: string;
  b64?: string;
  mimeType?: string;
}>;

export type ImageGenerationResponse = Readonly<{
  images: readonly GeneratedImage[];
  providerRequestId?: string;
}>;

export type ApiErrorBody = Readonly<{
  error: {
    code: string;
    message: string;
  };
}>;

export type ConnectivityTestResponse = Readonly<{
  ok: boolean;
  status: number;
  message: string;
}>;

export type GenerationHistoryItem = Readonly<{
  id: string;
  prompt: string;
  mode: ImageMode;
  createdAt: string;
  result: ImageGenerationResponse;
}>;

export type ImageJobStatus = "queued" | "running" | "succeeded" | "failed";

export type ImageJobError = Readonly<{
  code: string;
  message: string;
}>;

export type ImageJobCreateResponse = Readonly<{
  jobId: string;
  status: ImageJobStatus;
  statusUrl: string;
  retryAfterMs: number;
}>;

export type ImageJobStatusResponse = Readonly<{
  jobId: string;
  status: ImageJobStatus;
  createdAt: string;
  updatedAt: string;
  retryAfterMs: number;
  result?: ImageGenerationResponse;
  error?: ImageJobError;
}>;

export type ClientImageRequest = Readonly<{
  prompt: string;
  apiBaseUrl?: string;
  mode: ImageMode;
  apiKey?: string;
  model?: string;
  size?: string;
  quality?: string;
  sitePassword?: string;
  images?: readonly File[];
}>;

export type ConnectivityTestRequest = Readonly<{
  apiBaseUrl?: string;
  apiKey?: string;
  sitePassword?: string;
}>;
