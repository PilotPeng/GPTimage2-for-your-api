// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/config/route";

beforeEach(() => {
  process.env.GPT_IMAGE2_UI_MODE = "configurable";
  process.env.GPT_IMAGE2_API_BASE_URL = "https://api.example.com/v1";
  process.env.GPT_IMAGE2_API_KEY = "server-key";
  process.env.GPT_IMAGE2_DEFAULT_MODEL = "gpt-image-2";
  process.env.MAX_UPLOAD_COUNT = "4";
  process.env.MAX_TOTAL_UPLOAD_BYTES = "41943040";
  process.env.SITE_ACCESS_PASSWORD = "";
});

afterEach(() => {
  delete process.env.GPT_IMAGE2_UI_MODE;
  delete process.env.GPT_IMAGE2_API_BASE_URL;
  delete process.env.GPT_IMAGE2_API_KEY;
});

describe("GET /api/config", () => {
  it("returns the default API base URL in configurable mode", async () => {
    const response = GET();
    const body = await response.json();

    expect(body.defaultApiBaseUrl).toBe("https://api.example.com/v1");
    expect(body.apiSettingsEditable).toBe(true);
    expect(body.serverApiConfigured).toBe(true);
    expect(body.maxUploadCount).toBe(4);
    expect(body.maxTotalUploadBytes).toBe(41_943_040);
  });

  it("does not expose the default API base URL in sealed mode", async () => {
    process.env.GPT_IMAGE2_UI_MODE = "sealed";

    const response = GET();
    const body = await response.json();

    expect(body.defaultApiBaseUrl).toBe("");
    expect(body.apiSettingsEditable).toBe(false);
    expect(body.serverApiConfigured).toBe(true);
  });
});
