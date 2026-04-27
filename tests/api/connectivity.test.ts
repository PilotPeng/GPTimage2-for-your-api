// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/connectivity/route";

const createRequest = (body: object) => new Request("http://localhost/api/connectivity", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  process.env.ALLOW_PRIVATE_ENDPOINTS = "false";
  process.env.GPT_IMAGE2_UI_MODE = "configurable";
  process.env.GPT_IMAGE2_API_BASE_URL = "";
  process.env.GPT_IMAGE2_API_KEY = "server-key";
  process.env.GPT_IMAGE2_AUTH_HEADER = "Authorization";
  process.env.GPT_IMAGE2_AUTH_SCHEME = "Bearer";
  process.env.REQUEST_TIMEOUT_MS = "120000";
  process.env.SITE_ACCESS_PASSWORD = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/connectivity", () => {
  it("tests /models without calling image generation endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await POST(createRequest({ apiBaseUrl: "https://api.example.com/v1", apiKey: "request-key" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 200, message: "连通测试成功：/models 可访问，未触发图片生成。" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer request-key" },
      }),
    );
  });

  it("rejects private endpoints before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(createRequest({ apiBaseUrl: "https://localhost/v1", apiKey: "request-key" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_ENDPOINT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not leak api keys in failed connectivity messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Invalid server-key request-key", { status: 401 }));

    const response = await POST(createRequest({ apiBaseUrl: "https://api.example.com/v1", apiKey: "request-key" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("[REDACTED]");
    expect(body.message).not.toContain("server-key");
    expect(body.message).not.toContain("request-key");
  });

  it("uses server API settings in sealed mode", async () => {
    process.env.GPT_IMAGE2_UI_MODE = "sealed";
    process.env.GPT_IMAGE2_API_BASE_URL = "https://sealed.example.com/v1";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await POST(createRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sealed.example.com/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer server-key" } }),
    );
  });

  it("rejects client API settings in sealed mode", async () => {
    process.env.GPT_IMAGE2_UI_MODE = "sealed";
    process.env.GPT_IMAGE2_API_BASE_URL = "https://sealed.example.com/v1";

    const response = await POST(createRequest({ apiBaseUrl: "https://api.example.com/v1", apiKey: "request-key" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("API_SETTINGS_LOCKED");
  });
});
