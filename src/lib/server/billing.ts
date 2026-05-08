import { AppError } from "./errors";
import { getAppStore } from "./appStore";
import { getImageJobStore } from "./imageJobStore";
import type { ImageMode } from "@/lib/shared/types";
import type { ServerConfig } from "./config";

export const getGenerationCreditCost = (mode: ImageMode, config: ServerConfig) => {
  if (mode === "reference") {
    return config.creditCostReference;
  }

  if (mode === "edit") {
    return config.creditCostEdit;
  }

  return config.creditCostGenerate;
};

export const reserveGenerationCredits = (input: Readonly<{
  userId: string;
  jobId: string;
  mode: ImageMode;
  config: ServerConfig;
}>) => {
  const imageJobExists = Boolean(getImageJobStore(input.config.imageJobDbPath).getJob(input.jobId, input.config.imageJobPollRetryMs));

  return getAppStore(input.config.appDbPath).reserveGenerationCredits({
    userId: input.userId,
    jobId: input.jobId,
    cost: getGenerationCreditCost(input.mode, input.config),
    imageJobExists,
  });
};

export const finalizeGenerationCharge = (jobId: string, config: ServerConfig) => {
  if (!config.billingEnabled) {
    return;
  }

  getAppStore(config.appDbPath).finalizeGenerationCharge(jobId);
};

export const refundGenerationCharge = (jobId: string, config: ServerConfig, memo = "生成失败，退回预扣额度。") => {
  if (!config.billingEnabled) {
    return;
  }

  getAppStore(config.appDbPath).refundGenerationCharge(jobId, memo);
};

export const assertJobOwner = (jobId: string, userId: string, config: ServerConfig) => {
  if (!config.billingEnabled) {
    return;
  }

  const charge = getAppStore(config.appDbPath).getGenerationCharge(jobId);

  if (!charge || charge.user_id !== userId) {
    throw new AppError(404, "IMAGE_JOB_NOT_FOUND", "任务不存在或已过期，请重新提交。");
  }
};

export const getAccountSummary = (userId: string, config: ServerConfig) => getAppStore(config.appDbPath).getAccountSummary(userId);
