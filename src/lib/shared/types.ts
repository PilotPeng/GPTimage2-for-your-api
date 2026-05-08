export const imageModes = ["generate", "reference", "edit"] as const;
export const uiModes = ["configurable", "sealed"] as const;

export type ImageMode = (typeof imageModes)[number];
export type UiMode = (typeof uiModes)[number];

export type Role = "user" | "admin";
export type UserStatus = "active" | "disabled";
export type PaymentProvider = "alipay";
export type PaymentOrderStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";

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

export type CurrentUser = Readonly<{
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}>;

export type AuthStateResponse = Readonly<{
  authenticated: boolean;
  user: CurrentUser | null;
  sessionExpiresAt: string | null;
}>;

export type LoginRequest = Readonly<{
  email: string;
  password: string;
}>;

export type RegisterRequest = Readonly<{
  email: string;
  password: string;
}>;

export type LoginResponse = Readonly<{
  user: CurrentUser;
  sessionExpiresAt: string;
}>;

export type RegisterResponse = LoginResponse;

export type AccountLedgerEntry = Readonly<{
  id: string;
  delta: number;
  balanceAfter: number;
  type: string;
  referenceType: string | null;
  referenceId: string | null;
  memo: string | null;
  createdBy: string | null;
  createdAt: string;
}>;

export type PaymentPack = Readonly<{
  id: string;
  credits: number;
  amountCents: number;
  currency: string;
  title?: string;
  description?: string;
}>;

export type PaymentOrderSummary = Readonly<{
  id: string;
  userId: string;
  provider: PaymentProvider;
  providerOrderId: string | null;
  status: PaymentOrderStatus;
  packId: string;
  amountCents: number;
  currency: string;
  credits: number;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}>;

export type AccountSummaryResponse = Readonly<{
  user: CurrentUser;
  balance: number;
  ledgerEntries: readonly AccountLedgerEntry[];
  orders: readonly PaymentOrderSummary[];
}>;

export type CreditAdjustmentRequest = Readonly<{
  delta: number;
  memo?: string;
}>;

export type AdminUserSummary = Readonly<{
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  balance: number;
  createdAt: string;
  lastLoginAt: string | null;
}>;

export type UserListResponse = Readonly<{
  users: readonly AdminUserSummary[];
}>;

export type ActivationCodeSummary = Readonly<{
  id: string;
  credits: number;
  maxRedemptions: number;
  redeemedCount: number;
  expiresAt: string | null;
  disabledAt: string | null;
  createdAt: string;
}>;

export type ActivationCodeCreateRequest = Readonly<{
  credits: number;
  maxRedemptions?: number;
  expiresAt?: string;
}>;

export type ActivationCodeCreateResponse = Readonly<{
  code: string;
  activationCode: ActivationCodeSummary;
}>;

export type ActivationCodeRedeemRequest = Readonly<{
  code: string;
}>;

export type ActivationCodeRedeemResponse = Readonly<{
  balance: number;
  creditsAdded: number;
}>;

export type CreateOrderRequest = Readonly<{
  packId: string;
}>;

export type CreateOrderResponse = Readonly<{
  order: PaymentOrderSummary;
  checkoutUrl: string;
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
