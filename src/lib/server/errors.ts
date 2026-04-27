import { NextResponse } from "next/server";
import type { ApiErrorBody } from "@/lib/shared/types";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const createErrorResponse = (error: unknown) => {
  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    return NextResponse.json(body, { status: error.status });
  }

  const body: ApiErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "生成失败，请稍后重试。",
    },
  };

  return NextResponse.json(body, { status: 500 });
};
