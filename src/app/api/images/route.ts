import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/config";
import { createErrorResponse, AppError } from "@/lib/server/errors";
import { generateImage } from "@/lib/server/gptImage2Client";
import { parseImageRequest } from "@/lib/server/imageRequest";

export const runtime = "nodejs";

const verifySiteAccess = (sitePassword: string | undefined, expectedPassword: string) => {
  if (!expectedPassword) {
    return;
  }

  if (sitePassword !== expectedPassword) {
    throw new AppError(401, "SITE_PASSWORD_REQUIRED", "访问密码不正确。");
  }
};

const MULTIPART_OVERHEAD_BYTES = 1_048_576;

const verifyRequestSize = (request: Request, maxTotalUploadBytes: number) => {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) {
    return;
  }

  const requestBytes = Number.parseInt(contentLength, 10);
  const requestLimitBytes = maxTotalUploadBytes + MULTIPART_OVERHEAD_BYTES;

  if (Number.isNaN(requestBytes) || requestBytes <= requestLimitBytes) {
    return;
  }

  throw new AppError(413, "REQUEST_TOO_LARGE", "请求体过大，请压缩图片后再上传。");
};

export async function POST(request: Request) {
  try {
    const config = getServerConfig();
    verifyRequestSize(request, config.maxTotalUploadBytes);

    const formData = await request.formData();
    const input = await parseImageRequest(formData, {
      allowedImageMimeTypes: config.allowedImageMimeTypes,
      maxUploadBytes: config.maxUploadBytes,
      maxUploadCount: config.maxUploadCount,
      maxTotalUploadBytes: config.maxTotalUploadBytes,
      allowPrivateEndpoints: config.allowPrivateEndpoints,
      defaultApiBaseUrl: config.defaultApiBaseUrl,
      uiMode: config.uiMode,
    });

    verifySiteAccess(input.sitePassword, config.siteAccessPassword);

    const result = await generateImage(input, {
      defaultApiKey: config.defaultApiKey,
      defaultModel: input.model ?? config.defaultModel,
      authHeader: config.authHeader,
      authScheme: config.authScheme,
      requestTimeoutMs: config.requestTimeoutMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
