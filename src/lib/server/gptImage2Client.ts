import { AppError } from "./errors";
import { normalizeProviderResponse } from "./imageResponse";
import type { ImageGenerationResponse } from "@/lib/shared/types";
import type { ParsedImageRequest } from "./imageRequest";

type GptImage2ClientConfig = Readonly<{
  defaultApiKey: string;
  defaultModel: string;
  authHeader: string;
  authScheme: string;
  requestTimeoutMs: number;
}>;

const getApiKey = (input: ParsedImageRequest, config: GptImage2ClientConfig) => {
  const apiKey = input.apiKey ?? config.defaultApiKey;

  if (!apiKey) {
    throw new AppError(400, "API_KEY_REQUIRED", "请输入 API Key，或在服务器环境变量中配置默认 API Key。");
  }

  return apiKey;
};

export const createAuthValue = (apiKey: string, authScheme: string) => {
  const trimmedApiKey = apiKey.trim();
  const scheme = authScheme.trim();

  if (!scheme) {
    return trimmedApiKey;
  }

  if (trimmedApiKey.toLowerCase().startsWith(`${scheme.toLowerCase()} `)) {
    return trimmedApiKey;
  }

  return `${scheme} ${trimmedApiKey}`;
};

const createJsonPayload = (input: ParsedImageRequest, defaultModel: string) => ({
  prompt: input.prompt,
  model: input.model ?? defaultModel,
  ...(input.size ? { size: input.size } : {}),
  ...(input.quality ? { quality: input.quality } : {}),
});

const appendOptionalFields = (formData: FormData, input: ParsedImageRequest, defaultModel: string) => {
  const payload = createJsonPayload(input, defaultModel);
  formData.set("prompt", payload.prompt);
  formData.set("model", payload.model);

  if (payload.size) {
    formData.set("size", payload.size);
  }

  if (payload.quality) {
    formData.set("quality", payload.quality);
  }
};

const createMultipartBody = (input: ParsedImageRequest, defaultModel: string) => {
  const formData = new FormData();
  appendOptionalFields(formData, input, defaultModel);

  for (const image of input.images) {
    const blob = new Blob([image.bytes], { type: image.mimeType });
    formData.append("image", blob, image.filename);
  }

  return formData;
};

const createProviderRequest = (
  input: ParsedImageRequest,
  config: GptImage2ClientConfig,
  apiKey: string,
): RequestInit => {
  const authHeaders = {
    [config.authHeader]: createAuthValue(apiKey, config.authScheme),
  };

  if (input.images.length > 0) {
    return {
      method: "POST",
      headers: authHeaders,
      body: createMultipartBody(input, config.defaultModel),
    };
  }

  return {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createJsonPayload(input, config.defaultModel)),
  };
};

const getTextResponse = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const extractErrorMessage = (rawBody: string) => {
  if (!rawBody.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const error = record.error;

      if (typeof error === "string") {
        return error;
      }

      if (typeof error === "object" && error !== null) {
        const errorRecord = error as Record<string, unknown>;
        if (typeof errorRecord.message === "string") {
          return errorRecord.message;
        }
      }

      if (typeof record.message === "string") {
        return record.message;
      }
    }
  } catch {
    return rawBody;
  }

  return rawBody;
};

const redactSecret = (value: string, secret: string) => {
  if (!secret) {
    return value;
  }

  return value.split(secret).join("[REDACTED]");
};

const createSafeUpstreamMessage = async (response: Response, apiKey: string) => {
  const rawBody = await getTextResponse(response);
  const message = redactSecret(extractErrorMessage(rawBody), apiKey).trim().slice(0, 300);
  const suffix = message ? `：${message}` : "。";
  return `上游接口返回 HTTP ${response.status}${suffix}`;
};

const mapUpstreamStatus = async (response: Response, apiKey: string) => {
  if (response.status === 401 || response.status === 403) {
    return new AppError(502, "UPSTREAM_UNAUTHORIZED", await createSafeUpstreamMessage(response, apiKey));
  }

  if (response.status === 429) {
    return new AppError(502, "UPSTREAM_RATE_LIMITED", await createSafeUpstreamMessage(response, apiKey));
  }

  return new AppError(502, "UPSTREAM_ERROR", await createSafeUpstreamMessage(response, apiKey));
};

const parseJsonResponse = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    throw new AppError(502, "UPSTREAM_BAD_RESPONSE", "上游接口返回的不是有效 JSON。");
  }
};

export const generateImage = async (
  input: ParsedImageRequest,
  config: GptImage2ClientConfig,
): Promise<ImageGenerationResponse> => {
  const apiKey = getApiKey(input, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(input.endpointUrl, {
      ...createProviderRequest(input, config, apiKey),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await mapUpstreamStatus(response, apiKey);
    }

    return normalizeProviderResponse(await parseJsonResponse(response));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "UPSTREAM_TIMEOUT", "上游接口响应超时，请稍后重试。");
    }

    throw new AppError(502, "UPSTREAM_NETWORK_ERROR", "无法连接上游接口，请检查接口地址。");
  } finally {
    clearTimeout(timeout);
  }
};
