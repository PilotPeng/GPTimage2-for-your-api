import { z } from "zod";
import { uiModes } from "@/lib/shared/types";
import { inferApiBaseUrl } from "./apiUrls";

const envSchema = z.object({
  GPT_IMAGE2_UI_MODE: z.enum(uiModes).optional().default("configurable"),
  SITE_ACCESS_PASSWORD: z.string().optional().default(""),
  GPT_IMAGE2_API_KEY: z.string().optional().default(""),
  GPT_IMAGE2_DEFAULT_ENDPOINT: z.string().optional().default(""),
  GPT_IMAGE2_API_BASE_URL: z.string().optional().default(""),
  GPT_IMAGE2_GENERATION_ENDPOINT: z.string().optional().default(""),
  GPT_IMAGE2_DEFAULT_MODEL: z.string().optional().default("gpt-image2"),
  GPT_IMAGE2_AUTH_HEADER: z.string().optional().default("Authorization"),
  GPT_IMAGE2_AUTH_SCHEME: z.string().optional().default("Bearer"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(120_000),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional().default(10_485_760),
  MAX_UPLOAD_COUNT: z.coerce.number().int().positive().optional().default(4),
  MAX_TOTAL_UPLOAD_BYTES: z.coerce.number().int().positive().optional().default(41_943_040),
  ALLOWED_IMAGE_MIME_TYPES: z.string().optional().default("image/png,image/jpeg,image/webp"),
  ALLOW_PRIVATE_ENDPOINTS: z.enum(["true", "false"]).optional().default("false"),
});

const getDefaultApiBaseUrl = (explicitBaseUrl: string, generationEndpoint: string, defaultEndpoint: string) => {
  const source = explicitBaseUrl || generationEndpoint || defaultEndpoint;
  return source ? inferApiBaseUrl(source) : "";
};

export const getServerConfig = () => {
  const env = envSchema.parse(process.env);

  return {
    uiMode: env.GPT_IMAGE2_UI_MODE,
    siteAccessPassword: env.SITE_ACCESS_PASSWORD,
    defaultApiKey: env.GPT_IMAGE2_API_KEY,
    defaultApiBaseUrl: getDefaultApiBaseUrl(
      env.GPT_IMAGE2_API_BASE_URL,
      env.GPT_IMAGE2_GENERATION_ENDPOINT,
      env.GPT_IMAGE2_DEFAULT_ENDPOINT,
    ),
    defaultModel: env.GPT_IMAGE2_DEFAULT_MODEL,
    authHeader: env.GPT_IMAGE2_AUTH_HEADER,
    authScheme: env.GPT_IMAGE2_AUTH_SCHEME,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    maxUploadCount: env.MAX_UPLOAD_COUNT,
    maxTotalUploadBytes: env.MAX_TOTAL_UPLOAD_BYTES,
    allowedImageMimeTypes: env.ALLOWED_IMAGE_MIME_TYPES.split(",")
      .map((mimeType) => mimeType.trim())
      .filter(Boolean),
    allowPrivateEndpoints: env.ALLOW_PRIVATE_ENDPOINTS === "true",
  } as const;
};
