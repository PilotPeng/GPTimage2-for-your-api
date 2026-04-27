import { z } from "zod";
import { imageModes, type ImageMode, type UiMode } from "@/lib/shared/types";
import { buildImageEndpointUrl } from "./apiUrls";
import { AppError } from "./errors";

const optionalTrimmedString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : undefined;
  });

const formSchema = z.object({
  prompt: z.string().trim().min(1, "请输入 prompt。").max(4000, "Prompt 最多支持 4000 个字符。"),
  apiBaseUrl: optionalTrimmedString,
  mode: z.enum(imageModes),
  apiKey: optionalTrimmedString,
  model: optionalTrimmedString,
  size: optionalTrimmedString,
  quality: optionalTrimmedString,
  sitePassword: optionalTrimmedString,
});

export type UploadedImage = Readonly<{
  file: File;
  bytes: ArrayBuffer;
  filename: string;
  mimeType: string;
  size: number;
}>;

export type ParsedImageRequest = Readonly<{
  prompt: string;
  endpointUrl: string;
  mode: ImageMode;
  apiKey?: string;
  model?: string;
  size?: string;
  quality?: string;
  sitePassword?: string;
  images: readonly UploadedImage[];
}>;

const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

const getFormFiles = (formData: FormData, key: string) => formData
  .getAll(key)
  .filter((value): value is File => value instanceof File && value.size > 0);

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));

  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first = 0, second = 0] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized.includes(":")) {
    return true;
  }

  return isPrivateIpv4(normalized);
};

export const validateEndpoint = (endpointUrl: string, allowPrivateEndpoints: boolean) => {
  const url = new URL(endpointUrl);

  if (!allowPrivateEndpoints && url.protocol !== "https:") {
    throw new AppError(400, "INVALID_ENDPOINT", "接口地址必须使用 HTTPS。");
  }

  if (!allowPrivateEndpoints && (url.username || url.password)) {
    throw new AppError(400, "INVALID_ENDPOINT", "接口地址不能包含用户名或密码。");
  }

  if (!allowPrivateEndpoints && isBlockedHostname(url.hostname)) {
    throw new AppError(400, "INVALID_ENDPOINT", "不能请求本地或内网接口地址。");
  }
};

const createUploadedImage = async (file: File): Promise<UploadedImage> => ({
  file,
  bytes: await file.arrayBuffer(),
  filename: file.name || "upload",
  mimeType: file.type,
  size: file.size,
});

const validateImages = async (
  files: readonly File[],
  mode: ImageMode,
  allowedImageMimeTypes: readonly string[],
  maxUploadBytes: number,
  maxUploadCount: number,
  maxTotalUploadBytes: number,
): Promise<readonly UploadedImage[]> => {
  if (mode === "generate") {
    if (files.length > 0) {
      throw new AppError(400, "IMAGE_NOT_ALLOWED", "纯文本生成模式不能上传图片。请选择参考图生成或编辑原图。");
    }

    return [];
  }

  if (files.length === 0) {
    throw new AppError(400, "IMAGE_REQUIRED", "参考图或编辑模式需要上传图片。");
  }

  if (files.length > maxUploadCount) {
    throw new AppError(413, "TOO_MANY_IMAGES", `最多只能上传 ${maxUploadCount} 张图片。`);
  }

  const totalUploadBytes = files.reduce((total, file) => total + file.size, 0);

  if (totalUploadBytes > maxTotalUploadBytes) {
    throw new AppError(413, "IMAGES_TOO_LARGE", "图片总大小过大，请压缩后再上传。");
  }

  for (const file of files) {
    if (!allowedImageMimeTypes.includes(file.type)) {
      throw new AppError(415, "INVALID_IMAGE_TYPE", "图片格式仅支持 PNG、JPEG 或 WebP。");
    }

    if (file.size > maxUploadBytes) {
      throw new AppError(413, "IMAGE_TOO_LARGE", "单张图片文件过大，请压缩后再上传。");
    }
  }

  return Promise.all(files.map(createUploadedImage));
};

type ParseImageRequestOptions = Readonly<{
  allowedImageMimeTypes: readonly string[];
  maxUploadBytes: number;
  maxUploadCount: number;
  maxTotalUploadBytes: number;
  allowPrivateEndpoints: boolean;
  defaultApiBaseUrl: string;
  uiMode: UiMode;
}>;

const getLockedApiSettingsError = () => new AppError(
  400,
  "API_SETTINGS_LOCKED",
  "当前封装版使用服务器预设 API 配置，不能从前端提交 API 地址或 API Key。",
);

const getApiBaseUrl = (requestApiBaseUrl: string | undefined, options: ParseImageRequestOptions) => {
  if (options.uiMode === "sealed") {
    if (requestApiBaseUrl) {
      throw getLockedApiSettingsError();
    }

    if (!options.defaultApiBaseUrl) {
      throw new AppError(400, "API_BASE_URL_REQUIRED", "服务器未配置默认 API 基础地址。请设置 GPT_IMAGE2_API_BASE_URL。");
    }

    return options.defaultApiBaseUrl;
  }

  const apiBaseUrl = requestApiBaseUrl || options.defaultApiBaseUrl;

  if (!apiBaseUrl) {
    throw new AppError(400, "API_BASE_URL_REQUIRED", "请输入 API 基础地址，或在服务器环境变量中配置默认 API 基础地址。");
  }

  return apiBaseUrl;
};

export const parseImageRequest = async (
  formData: FormData,
  options: ParseImageRequestOptions,
): Promise<ParsedImageRequest> => {
  const parsed = formSchema.safeParse({
    prompt: getFormString(formData, "prompt"),
    apiBaseUrl:
      getFormString(formData, "apiBaseUrl") ??
      getFormString(formData, "generationEndpointUrl") ??
      getFormString(formData, "endpointUrl"),
    mode: getFormString(formData, "mode"),
    apiKey: getFormString(formData, "apiKey"),
    model: getFormString(formData, "model"),
    size: getFormString(formData, "size"),
    quality: getFormString(formData, "quality"),
    sitePassword: getFormString(formData, "sitePassword"),
  });

  if (!parsed.success) {
    throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
  }

  if (options.uiMode === "sealed" && parsed.data.apiKey) {
    throw getLockedApiSettingsError();
  }

  const apiBaseUrl = getApiBaseUrl(parsed.data.apiBaseUrl, options);
  const endpointUrl = buildImageEndpointUrl(apiBaseUrl, parsed.data.mode);
  validateEndpoint(endpointUrl, options.allowPrivateEndpoints);

  const images = await validateImages(
    getFormFiles(formData, "image"),
    parsed.data.mode,
    options.allowedImageMimeTypes,
    options.maxUploadBytes,
    options.maxUploadCount,
    options.maxTotalUploadBytes,
  );

  return {
    prompt: parsed.data.prompt,
    endpointUrl,
    mode: parsed.data.mode,
    images,
    ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
    ...(parsed.data.model ? { model: parsed.data.model } : {}),
    ...(parsed.data.size ? { size: parsed.data.size } : {}),
    ...(parsed.data.quality ? { quality: parsed.data.quality } : {}),
    ...(parsed.data.sitePassword ? { sitePassword: parsed.data.sitePassword } : {}),
  };
};
