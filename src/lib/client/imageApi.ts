import type {
  ApiErrorBody,
  ClientImageRequest,
  ConnectivityTestRequest,
  ConnectivityTestResponse,
  ImageJobCreateResponse,
  ImageJobStatusResponse,
} from "@/lib/shared/types";

export type PublicConfig = Readonly<{
  defaultApiBaseUrl: string;
  defaultModel: string;
  requiresSitePassword: boolean;
  maxUploadBytes: number;
  maxUploadCount: number;
  maxTotalUploadBytes: number;
  allowedImageMimeTypes: readonly string[];
  apiSettingsEditable: boolean;
  serverApiConfigured: boolean;
}>;

const getApiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  if (typeof window === "undefined") {
    return normalizedPath;
  }

  const currentPath = window.location.pathname;
  const basePath = currentPath.endsWith("/") ? currentPath : `${currentPath}/`;
  return `${basePath}${normalizedPath}`;
};

const parseErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    return body.error?.message ?? "请求失败，请稍后重试。";
  } catch {
    return "请求失败，请稍后重试。";
  }
};

export const fetchPublicConfig = async (): Promise<PublicConfig> => {
  const response = await fetch(getApiPath("api/config"));

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as PublicConfig;
};

export const testConnectivity = async (request: ConnectivityTestRequest): Promise<ConnectivityTestResponse> => {
  const response = await fetch(getApiPath("api/connectivity"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as ConnectivityTestResponse;
};

const createImageRequestFormData = (request: ClientImageRequest, jobId: string) => {
  const formData = new FormData();
  formData.set("prompt", request.prompt);
  formData.set("mode", request.mode);

  if (request.apiBaseUrl) {
    formData.set("apiBaseUrl", request.apiBaseUrl);
  }

  if (request.apiKey) {
    formData.set("apiKey", request.apiKey);
  }

  if (request.model) {
    formData.set("model", request.model);
  }

  if (request.size) {
    formData.set("size", request.size);
  }

  if (request.quality) {
    formData.set("quality", request.quality);
  }

  if (request.sitePassword) {
    formData.set("sitePassword", request.sitePassword);
  }

  for (const image of request.images ?? []) {
    formData.append("image", image);
  }

  formData.set("jobId", jobId);

  return formData;
};

export const createImageJob = async (request: ClientImageRequest, jobId: string): Promise<ImageJobCreateResponse> => {
  const response = await fetch(getApiPath("api/images"), {
    method: "POST",
    body: createImageRequestFormData(request, jobId),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as ImageJobCreateResponse;
};

export const fetchImageJob = async (jobId: string): Promise<ImageJobStatusResponse> => {
  const response = await fetch(getApiPath(`api/images/jobs/${encodeURIComponent(jobId)}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as ImageJobStatusResponse;
};
