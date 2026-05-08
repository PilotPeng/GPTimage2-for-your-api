import path from "node:path";
import { z } from "zod";
import { uiModes, type PaymentPack, type PaymentProvider } from "@/lib/shared/types";
import { inferApiBaseUrl } from "./apiUrls";

const defaultJobDbPath = process.env.NODE_ENV === "production"
  ? "/app/data/image-jobs.sqlite"
  : path.join(process.cwd(), ".tmp", "image-jobs.sqlite");

const defaultAppDbPath = process.env.NODE_ENV === "production"
  ? "/app/data/app.sqlite"
  : path.join(process.cwd(), ".tmp", "app.sqlite");

const paymentPackSchema = z.object({
  id: z.string().trim().min(1),
  credits: z.coerce.number().int().positive(),
  amountCents: z.coerce.number().int().positive(),
  currency: z.string().trim().min(3).max(3),
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

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
  IMAGE_JOB_DB_PATH: z.string().optional().default(defaultJobDbPath),
  IMAGE_JOB_CONCURRENCY: z.coerce.number().int().positive().optional().default(1),
  IMAGE_JOB_MAX_PENDING: z.coerce.number().int().positive().optional().default(20),
  IMAGE_JOB_RESULT_TTL_MS: z.coerce.number().int().positive().optional().default(86_400_000),
  IMAGE_JOB_POLL_RETRY_MS: z.coerce.number().int().positive().optional().default(2_000),
  BILLING_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  APP_DB_PATH: z.string().optional().default(defaultAppDbPath),
  APP_BASE_URL: z.string().optional().default(""),
  SESSION_SECRET: z.string().optional().default(""),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().optional().default(30),
  ADMIN_BOOTSTRAP_EMAIL: z.string().optional().default(""),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional().default(""),
  ALLOW_SELF_REGISTRATION: z.enum(["true", "false"]).optional().default("false"),
  INITIAL_FREE_CREDITS: z.coerce.number().int().nonnegative().optional().default(0),
  CREDIT_COST_GENERATE: z.coerce.number().int().positive().optional().default(1),
  CREDIT_COST_REFERENCE: z.coerce.number().int().positive().optional().default(1),
  CREDIT_COST_EDIT: z.coerce.number().int().positive().optional().default(1),
  PAYMENT_PROVIDER: z.enum(["alipay"]).optional().default("alipay"),
  PAYMENT_CURRENCY: z.string().optional().default("CNY"),
  PAYMENT_PACKS_JSON: z.string().optional().default("[]"),
  ALIPAY_APP_ID: z.string().optional().default(""),
  ALIPAY_SELLER_ID: z.string().optional().default(""),
  ALIPAY_PRIVATE_KEY: z.string().optional().default(""),
  ALIPAY_PUBLIC_KEY: z.string().optional().default(""),
  ALIPAY_GATEWAY_URL: z.string().optional().default("https://openapi.alipay.com/gateway.do"),
});

const getDefaultApiBaseUrl = (explicitBaseUrl: string, generationEndpoint: string, defaultEndpoint: string) => {
  const source = explicitBaseUrl || generationEndpoint || defaultEndpoint;
  return source ? inferApiBaseUrl(source) : "";
};

const parsePaymentPacks = (rawPacks: string): readonly PaymentPack[] => {
  if (!rawPacks.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawPacks) as unknown;
  return z.array(paymentPackSchema).parse(parsed);
};

const getPaymentProvider = (provider: string): PaymentProvider => provider as PaymentProvider;

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
    imageJobDbPath: env.IMAGE_JOB_DB_PATH,
    imageJobConcurrency: env.IMAGE_JOB_CONCURRENCY,
    imageJobMaxPending: env.IMAGE_JOB_MAX_PENDING,
    imageJobResultTtlMs: env.IMAGE_JOB_RESULT_TTL_MS,
    imageJobPollRetryMs: env.IMAGE_JOB_POLL_RETRY_MS,
    billingEnabled: env.BILLING_ENABLED === "true",
    appDbPath: env.APP_DB_PATH,
    appBaseUrl: env.APP_BASE_URL,
    sessionSecret: env.SESSION_SECRET,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    adminBootstrapEmail: env.ADMIN_BOOTSTRAP_EMAIL,
    adminBootstrapPassword: env.ADMIN_BOOTSTRAP_PASSWORD,
    allowSelfRegistration: env.ALLOW_SELF_REGISTRATION === "true",
    initialFreeCredits: env.INITIAL_FREE_CREDITS,
    creditCostGenerate: env.CREDIT_COST_GENERATE,
    creditCostReference: env.CREDIT_COST_REFERENCE,
    creditCostEdit: env.CREDIT_COST_EDIT,
    paymentProvider: getPaymentProvider(env.PAYMENT_PROVIDER),
    paymentCurrency: env.PAYMENT_CURRENCY,
    paymentPacks: parsePaymentPacks(env.PAYMENT_PACKS_JSON),
    alipayAppId: env.ALIPAY_APP_ID,
    alipaySellerId: env.ALIPAY_SELLER_ID,
    alipayPrivateKey: env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: env.ALIPAY_PUBLIC_KEY,
    alipayGatewayUrl: env.ALIPAY_GATEWAY_URL,
  } as const;
};

export type ServerConfig = ReturnType<typeof getServerConfig>;
