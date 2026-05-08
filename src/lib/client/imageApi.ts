import type {
  AccountSummaryResponse,
  ActivationCodeCreateRequest,
  ActivationCodeCreateResponse,
  ActivationCodeRedeemRequest,
  ActivationCodeRedeemResponse,
  ApiErrorBody,
  AuthStateResponse,
  ClientImageRequest,
  ConnectivityTestRequest,
  ConnectivityTestResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  CreditAdjustmentRequest,
  ImageJobCreateResponse,
  ImageJobStatusResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  PaymentOrderSummary,
  PaymentPack,
  UserListResponse,
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
  billingEnabled: boolean;
}>;

type OrdersResponse = Readonly<{
  packs: readonly PaymentPack[];
  orders: readonly PaymentOrderSummary[];
}>;

const getApiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  if (typeof window === "undefined") {
    return `/${normalizedPath}`;
  }

  const currentPath = window.location.pathname;
  const prefix = currentPath === "/sealed" || currentPath.startsWith("/sealed/") ? "/sealed" : "";
  return `${prefix}/${normalizedPath}`;
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

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(getApiPath(path), {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as T;
};

export const fetchCurrentUser = () => fetchJson<AuthStateResponse>("api/auth/me", { cache: "no-store" });

export const login = (request: LoginRequest) => fetchJson<LoginResponse>("api/auth/login", {
  method: "POST",
  body: JSON.stringify(request),
});

export const register = (request: RegisterRequest) => fetchJson<RegisterResponse>("api/auth/register", {
  method: "POST",
  body: JSON.stringify(request),
});

export const logout = () => fetchJson<{ ok: boolean }>("api/auth/logout", { method: "POST" });

export const fetchAccount = () => fetchJson<AccountSummaryResponse>("api/account", { cache: "no-store" });

export const redeemActivationCode = (request: ActivationCodeRedeemRequest) => fetchJson<ActivationCodeRedeemResponse>("api/activation-codes/redeem", {
  method: "POST",
  body: JSON.stringify(request),
});

export const fetchOrders = () => fetchJson<OrdersResponse>("api/orders", { cache: "no-store" });

export const createOrder = (request: CreateOrderRequest) => fetchJson<CreateOrderResponse>("api/orders", {
  method: "POST",
  body: JSON.stringify(request),
});

export const fetchAdminUsers = (query: string) => fetchJson<UserListResponse>(`api/admin/users?query=${encodeURIComponent(query)}`, { cache: "no-store" });

export const adjustUserCredits = (userId: string, request: CreditAdjustmentRequest) => fetchJson<{ balance: number }>(`api/admin/users/${encodeURIComponent(userId)}/credits`, {
  method: "POST",
  body: JSON.stringify(request),
});

export const fetchActivationCodes = () => fetchJson<{ activationCodes: readonly ActivationCodeCreateResponse["activationCode"][] }>("api/admin/activation-codes", {
  cache: "no-store",
});

export const createActivationCode = (request: ActivationCodeCreateRequest) => fetchJson<ActivationCodeCreateResponse>("api/admin/activation-codes", {
  method: "POST",
  body: JSON.stringify(request),
});
