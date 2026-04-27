// @vitest-environment node

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/images/route";

const createRequest = (formData: FormData) => new Request("http://localhost/api/images", {
  method: "POST",
  body: formData,
});

const createBaseForm = () => {
  const formData = new FormData();
  formData.set("prompt", "a watercolor mountain");
  formData.set("apiBaseUrl", "https://api.example.com/v1");
  formData.set("mode", "generate");
  formData.set("apiKey", "secret-key");
  return formData;
};

beforeEach(() => {
  process.env.ALLOW_PRIVATE_ENDPOINTS = "false";
  process.env.GPT_IMAGE2_UI_MODE = "configurable";
  process.env.GPT_IMAGE2_API_BASE_URL = "";
  process.env.GPT_IMAGE2_API_KEY = "";
  process.env.MAX_UPLOAD_BYTES = "10485760";
  process.env.MAX_UPLOAD_COUNT = "4";
  process.env.MAX_TOTAL_UPLOAD_BYTES = "41943040";
  process.env.SITE_ACCESS_PASSWORD = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/images", () => {
  it("rejects missing prompt", async () => {
    const formData = createBaseForm();
    formData.delete("prompt");

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it.each([
    "http://127.0.0.1:8000/v1",
    "https://localhost/v1",
    "https://10.0.0.1/v1",
    "https://192.168.1.10/v1",
    "https://172.16.0.2/v1",
    "https://[::1]/v1",
  ])("rejects private endpoint %s by default", async (apiBaseUrl) => {
    const formData = createBaseForm();
    formData.set("apiBaseUrl", apiBaseUrl);

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_ENDPOINT");
  });

  it("rejects oversized requests before parsing multipart bodies", async () => {
    const request = new Request("http://localhost/api/images", {
      method: "POST",
      headers: { "content-length": "42991617" },
      body: new FormData(),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("REQUEST_TOO_LARGE");
  });

  it("requires an image for edit mode", async () => {
    const formData = createBaseForm();
    formData.set("mode", "edit");

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("IMAGE_REQUIRED");
  });

  it("rejects images in generate mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const formData = createBaseForm();
    formData.set("image", new File(["image"], "image.png", { type: "image/png" }));

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("IMAGE_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts multiple images for reference mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mime_type: "image/png" }] }), { status: 200 }),
    );
    const formData = createBaseForm();
    formData.set("mode", "reference");
    formData.append("image", new File(["image-1"], "image-1.png", { type: "image/png" }));
    formData.append("image", new File(["image-2"], "image-2.webp", { type: "image/webp" }));

    const response = await POST(createRequest(formData));
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = init?.body as FormData;

    expect(response.status).toBe(200);
    expect(body.getAll("image")).toHaveLength(2);
    expect(body.get("image[]")).toBeNull();
  });

  it("rejects too many images", async () => {
    const formData = createBaseForm();
    formData.set("mode", "reference");

    for (const index of [1, 2, 3, 4, 5]) {
      formData.append("image", new File([`image-${index}`], `image-${index}.png`, { type: "image/png" }));
    }

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("TOO_MANY_IMAGES");
  });

  it("rejects unsupported image types", async () => {
    const formData = createBaseForm();
    formData.set("mode", "reference");
    formData.set("image", new File(["not image"], "note.txt", { type: "text/plain" }));

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error.code).toBe("INVALID_IMAGE_TYPE");
  });

  it("rejects images over the per-file limit", async () => {
    process.env.MAX_UPLOAD_BYTES = "4";
    const formData = createBaseForm();
    formData.set("mode", "edit");
    formData.set("image", new File(["image"], "image.png", { type: "image/png" }));

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("IMAGE_TOO_LARGE");
  });

  it("rejects images over the total upload limit", async () => {
    process.env.MAX_TOTAL_UPLOAD_BYTES = "8";
    const formData = createBaseForm();
    formData.set("mode", "reference");
    formData.append("image", new File(["image-1!"], "image-1.png", { type: "image/png" }));
    formData.append("image", new File(["image-2!"], "image-2.png", { type: "image/png" }));

    const response = await POST(createRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("IMAGES_TOO_LARGE");
  });

  it("returns normalized upstream success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mime_type: "image/png" }] }), { status: 200 }),
    );

    const response = await POST(createRequest(createBaseForm()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.images[0]).toEqual({ b64: "abc", mimeType: "image/png" });
  });

  it("uses server defaults when configurable requests omit apiBaseUrl", async () => {
    process.env.GPT_IMAGE2_API_BASE_URL = "https://server.example.com/v1";
    process.env.GPT_IMAGE2_API_KEY = "server-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mime_type: "image/png" }] }), { status: 200 }),
    );
    const formData = createBaseForm();
    formData.delete("apiBaseUrl");
    formData.delete("apiKey");

    const response = await POST(createRequest(formData));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.example.com/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses server API settings in sealed mode", async () => {
    process.env.GPT_IMAGE2_UI_MODE = "sealed";
    process.env.GPT_IMAGE2_API_BASE_URL = "https://sealed.example.com/v1";
    process.env.GPT_IMAGE2_API_KEY = "sealed-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ images: [{ b64: "abc", mime_type: "image/png" }] }), { status: 200 }),
    );
    const formData = createBaseForm();
    formData.delete("apiBaseUrl");
    formData.delete("apiKey");

    const response = await POST(createRequest(formData));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sealed.example.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sealed-key" }),
      }),
    );
  });

  it("rejects client API settings in sealed mode", async () => {
    process.env.GPT_IMAGE2_UI_MODE = "sealed";
    process.env.GPT_IMAGE2_API_BASE_URL = "https://sealed.example.com/v1";
    process.env.GPT_IMAGE2_API_KEY = "sealed-key";

    const response = await POST(createRequest(createBaseForm()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("API_SETTINGS_LOCKED");
  });
});
