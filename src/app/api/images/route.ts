import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { refundGenerationCharge, reserveGenerationCredits } from "@/lib/server/billing";
import { getServerConfig } from "@/lib/server/config";
import { createErrorResponse, AppError } from "@/lib/server/errors";
import { createImageJobId, enqueueImageJob } from "@/lib/server/imageJobQueue";
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

const getFormJobId = (formData: FormData) => {
  const value = formData.get("jobId");
  return typeof value === "string" && value.trim() ? value.trim() : createImageJobId();
};

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

    const user = config.billingEnabled ? await requireUser(request, config) : undefined;
    const formData = await request.formData();
    const jobId = getFormJobId(formData);
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

    if (user) {
      reserveGenerationCredits({ userId: user.id, jobId, mode: input.mode, config });
    }

    try {
      const job = enqueueImageJob(jobId, input, config);
      return NextResponse.json(job, { status: 202 });
    } catch (error) {
      if (user) {
        refundGenerationCharge(jobId, config, "任务创建失败，退回预扣额度。");
      }

      throw error;
    }
  } catch (error) {
    return createErrorResponse(error);
  }
}
