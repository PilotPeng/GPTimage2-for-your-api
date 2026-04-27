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
