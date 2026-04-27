import type { ImageMode } from "@/lib/shared/types";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeBasePath = (path: string) => {
  const withoutImageEndpoint = path.replace(/\/images\/(generations|edits)\/?$/, "");
  const withoutImagesPath = withoutImageEndpoint.replace(/\/images\/?$/, "");
  const trimmedPath = trimTrailingSlash(withoutImagesPath);

  if (!trimmedPath || trimmedPath === "/") {
    return "/v1";
  }

  return trimmedPath;
};

export const inferApiBaseUrl = (input: string) => {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return "";
  }

  const url = new URL(trimmedInput);
  return `${url.origin}${normalizeBasePath(url.pathname)}`;
};

export const buildImageEndpointUrl = (apiBaseUrl: string, mode: ImageMode) => {
  const baseUrl = inferApiBaseUrl(apiBaseUrl);
  const path = mode === "generate" ? "generations" : "edits";
  return `${baseUrl}/images/${path}`;
};

export const buildModelsEndpointUrl = (apiBaseUrl: string) => `${inferApiBaseUrl(apiBaseUrl)}/models`;
