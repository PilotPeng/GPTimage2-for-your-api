// @vitest-environment node

import { describe, expect, it, vi, afterEach } from "vitest";
import { generateImage } from "@/lib/server/gptImage2Client";
import type { ParsedImageRequest, UploadedImage } from "@/lib/server/imageRequest";

const config = {
  defaultApiKey: "server-key",
  defaultModel: "gpt-image2",
  authHeader: "Authorization",
  authScheme: "Bearer",
  requestTimeoutMs: 5000,
} as const;

const baseInput: ParsedImageRequest = {
  prompt: "a cat",
  endpointUrl: "https://api.example.com/images",
  mode: "generate",
  images: [],
};

const createUploadedImage = (name: string, content: string): UploadedImage => ({
  file: new File([content], name, { type: "image/png" }),
  bytes: new TextEncoder().encode(content).buffer,
  filename: name,
  mimeType: "image/png",
  size: content.length,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateImage", () => {
  it("posts JSON for prompt-only generation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/cat.png" }], id: "req_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await generateImage(baseInput, config);
    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/images",
      expect.objectContaining({ method: "POST" }),
    );
    expect(init?.headers).toEqual({
      Authorization: "Bearer server-key",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify({
      prompt: "a cat",
      model: "gpt-image2",
    }));
    expect(result.images[0]?.url).toBe("https://cdn.example.com/cat.png");
    expect(result.providerRequestId).toBe("req_1");
  });

  it("posts repeated image fields for multipart image requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mimeType: "image/png" }] }), { status: 200 }),
    );

    await generateImage(
      {
        ...baseInput,
        mode: "reference",
        images: [createUploadedImage("image-1.png", "image-1"), createUploadedImage("image-2.png", "image-2")],
      },
      config,
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = init?.body as FormData;

    expect(init?.headers).toEqual({ Authorization: "Bearer server-key" });
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll("image")).toHaveLength(2);
    expect(body.get("image[]")).toBeNull();
  });

  it("uses the request api key when supplied", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mimeType: "image/png" }] }), { status: 200 }),
    );

    await generateImage({ ...baseInput, apiKey: "request-key" }, config);
    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(init?.headers).toEqual({
      Authorization: "Bearer request-key",
      "Content-Type": "application/json",
    });
  });

  it("does not double-prefix request api keys that already include the scheme", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mimeType: "image/png" }] }), { status: 200 }),
    );

    await generateImage({ ...baseInput, apiKey: "Bearer request-key" }, config);
    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(init?.headers).toEqual({
      Authorization: "Bearer request-key",
      "Content-Type": "application/json",
    });
  });

  it("maps upstream authorization errors without leaking the api key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unauthorized server-key", { status: 401 }));

    await expect(generateImage(baseInput, config)).rejects.toMatchObject({
      status: 502,
      code: "UPSTREAM_UNAUTHORIZED",
    });

    await expect(generateImage(baseInput, config)).rejects.not.toThrow("server-key");
  });
});
