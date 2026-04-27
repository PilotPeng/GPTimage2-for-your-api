import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/server/config";

export const runtime = "nodejs";

export function GET() {
  const config = getServerConfig();

  return NextResponse.json({
    defaultApiBaseUrl: config.uiMode === "sealed" ? "" : config.defaultApiBaseUrl,
    defaultModel: config.defaultModel,
    requiresSitePassword: config.siteAccessPassword.length > 0,
    maxUploadBytes: config.maxUploadBytes,
    maxUploadCount: config.maxUploadCount,
    maxTotalUploadBytes: config.maxTotalUploadBytes,
    allowedImageMimeTypes: config.allowedImageMimeTypes,
    apiSettingsEditable: config.uiMode === "configurable",
    serverApiConfigured: Boolean(config.defaultApiBaseUrl && config.defaultApiKey),
  });
}
