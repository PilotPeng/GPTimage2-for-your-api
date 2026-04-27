import { AppError } from "./errors";
import type { ImageGenerationResponse, GeneratedImage } from "@/lib/shared/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const normalizeImage = (value: unknown): GeneratedImage | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    const text = value.trim();
    return text.startsWith("http") ? { url: text } : { b64: text };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const url = getString(value.url) ?? getString(value.image_url) ?? getString(value.uri);
  const b64 = getString(value.b64) ?? getString(value.base64) ?? getString(value.b64_json);
  const mimeType = getString(value.mimeType) ?? getString(value.mime_type) ?? getString(value.content_type);

  if (!url && !b64) {
    return undefined;
  }

  return {
    ...(url ? { url } : {}),
    ...(b64 ? { b64 } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
};

const normalizeImageArray = (value: unknown): readonly GeneratedImage[] => {
  if (!Array.isArray(value)) {
    const image = normalizeImage(value);
    return image ? [image] : [];
  }

  return value.map(normalizeImage).filter((image): image is GeneratedImage => Boolean(image));
};

export const normalizeProviderResponse = (payload: unknown): ImageGenerationResponse => {
  if (!isRecord(payload)) {
    throw new AppError(502, "UPSTREAM_BAD_RESPONSE", "上游接口返回格式无法识别。");
  }

  const images = [
    ...normalizeImageArray(payload.images),
    ...normalizeImageArray(payload.data),
    ...normalizeImageArray(payload.output),
    ...normalizeImageArray(payload.result),
    ...normalizeImageArray(payload.image),
  ];

  const providerRequestId =
    getString(payload.requestId) ?? getString(payload.request_id) ?? getString(payload.id);

  if (images.length === 0) {
    throw new AppError(502, "UPSTREAM_BAD_RESPONSE", "上游接口没有返回可显示的图片。");
  }

  return {
    images,
    ...(providerRequestId ? { providerRequestId } : {}),
  };
};
