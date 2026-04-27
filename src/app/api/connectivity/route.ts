import { NextResponse } from "next/server";
import { z } from "zod";
import { buildModelsEndpointUrl } from "@/lib/server/apiUrls";
import { getServerConfig } from "@/lib/server/config";
import { AppError, createErrorResponse } from "@/lib/server/errors";
import { createAuthValue } from "@/lib/server/gptImage2Client";
import { validateEndpoint } from "@/lib/server/imageRequest";

export const runtime = "nodejs";

const optionalTrimmedString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : undefined;
  });

const requestSchema = z.object({
  apiBaseUrl: optionalTrimmedString,
  apiKey: optionalTrimmedString,
  sitePassword: z.string().trim().optional().default(""),
});

const verifySiteAccess = (sitePassword: string | undefined, expectedPassword: string) => {
  if (!expectedPassword) {
    return;
  }

  if (sitePassword !== expectedPassword) {
    throw new AppError(401, "SITE_PASSWORD_REQUIRED", "访问密码不正确。");
  }
};

const getLockedApiSettingsError = () => new AppError(
  400,
  "API_SETTINGS_LOCKED",
  "当前封装版使用服务器预设 API 配置，不能从前端提交 API 地址或 API Key。",
);

const getApiKey = (requestApiKey: string | undefined, defaultApiKey: string, uiMode: "configurable" | "sealed") => {
  if (uiMode === "sealed" && requestApiKey) {
    throw getLockedApiSettingsError();
  }

  const apiKey = uiMode === "sealed" ? defaultApiKey : requestApiKey || defaultApiKey;

  if (!apiKey) {
    throw new AppError(400, "API_KEY_REQUIRED", "请输入 API Key，或在服务器环境变量中配置默认 API Key。");
  }

  return apiKey;
};

const getApiBaseUrl = (requestApiBaseUrl: string | undefined, defaultApiBaseUrl: string, uiMode: "configurable" | "sealed") => {
  if (uiMode === "sealed" && requestApiBaseUrl) {
    throw getLockedApiSettingsError();
  }

  const apiBaseUrl = uiMode === "sealed" ? defaultApiBaseUrl : requestApiBaseUrl || defaultApiBaseUrl;

  if (!apiBaseUrl) {
    throw new AppError(400, "API_BASE_URL_REQUIRED", "请输入 API 基础地址，或在服务器环境变量中配置默认 API 基础地址。");
  }

  return apiBaseUrl;
};

const redactSecrets = (value: string, secrets: readonly string[]) => secrets
  .filter(Boolean)
  .reduce((safeValue, secret) => safeValue.split(secret).join("[REDACTED]"), value);

const getSafeResponseText = async (response: Response, secrets: readonly string[]) => {
  try {
    return redactSecrets((await response.text()).trim(), secrets).slice(0, 200);
  } catch {
    return "";
  }
};

export async function POST(request: Request) {
  try {
    const config = getServerConfig();
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new AppError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "请求参数无效。");
    }

    verifySiteAccess(parsed.data.sitePassword, config.siteAccessPassword);

    const apiKey = getApiKey(parsed.data.apiKey, config.defaultApiKey, config.uiMode);
    const apiBaseUrl = getApiBaseUrl(parsed.data.apiBaseUrl, config.defaultApiBaseUrl, config.uiMode);
    const modelsEndpointUrl = buildModelsEndpointUrl(apiBaseUrl);
    validateEndpoint(modelsEndpointUrl, config.allowPrivateEndpoints);

    const response = await fetch(modelsEndpointUrl, {
      method: "GET",
      headers: {
        [config.authHeader]: createAuthValue(apiKey, config.authScheme),
      },
      signal: AbortSignal.timeout(Math.min(config.requestTimeoutMs, 15_000)),
    });

    if (!response.ok) {
      const responseText = await getSafeResponseText(response, [apiKey, parsed.data.apiKey ?? "", config.defaultApiKey]);

      return NextResponse.json({
        ok: false,
        status: response.status,
        message: `连通测试失败：/models 返回 HTTP ${response.status}${responseText ? `，${responseText}` : ""}`,
      });
    }

    return NextResponse.json({
      ok: true,
      status: response.status,
      message: "连通测试成功：/models 可访问，未触发图片生成。",
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
