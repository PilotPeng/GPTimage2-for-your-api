import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { assertJobOwner } from "@/lib/server/billing";
import { getServerConfig } from "@/lib/server/config";
import { createErrorResponse, AppError } from "@/lib/server/errors";
import { getImageJob, wakeImageJobWorker } from "@/lib/server/imageJobQueue";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{
    jobId: string;
  }>;
}>;

export async function GET(request: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const config = getServerConfig();

    if (config.billingEnabled) {
      const user = await requireUser(request, config);
      assertJobOwner(jobId, user.id, config);
    }

    wakeImageJobWorker(config);
    const job = getImageJob(jobId, config);

    if (!job) {
      throw new AppError(404, "IMAGE_JOB_NOT_FOUND", "任务不存在或已过期，请重新提交。");
    }

    return NextResponse.json(job, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
