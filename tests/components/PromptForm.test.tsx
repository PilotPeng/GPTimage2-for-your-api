import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PromptForm } from "@/components/PromptForm";

const publicConfig = {
  defaultApiBaseUrl: "https://api.example.com/v1",
  defaultModel: "gpt-image-2",
  requiresSitePassword: false,
  maxUploadBytes: 10485760,
  maxUploadCount: 4,
  maxTotalUploadBytes: 41943040,
  allowedImageMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  apiSettingsEditable: true,
  serverApiConfigured: true,
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PromptForm", () => {
  it("validates required prompt before submit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入创作描述。");
  });

  it("submits prompt-only requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/result.png" }] }), { status: 200 }),
      );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    expect(screen.queryByLabelText("上传图片")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("创作描述"), "a tiny robot");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/result.png");
    expect(screen.getByText("a tiny robot", { selector: "strong" })).toBeInTheDocument();
    expect(window.localStorage.getItem("gpt-image2.history")).toContain("a tiny robot");
    expect(fetchMock).toHaveBeenLastCalledWith("api/images", expect.objectContaining({ method: "POST" }));
  });

  it("restores stored generation history", async () => {
    window.localStorage.setItem("gpt-image2.history", JSON.stringify([
      {
        id: "history-1",
        prompt: "stored prompt",
        mode: "generate",
        createdAt: "2026-04-27T08:00:00.000Z",
        result: { images: [{ url: "https://cdn.example.com/stored.png" }] },
      },
    ]));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    expect(await screen.findByText("stored prompt")).toBeInTheDocument();
    await userEvent.click(screen.getByText("stored prompt"));
    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/stored.png");
  });

  it("runs connectivity tests without submitting the form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, status: 200, message: "连通测试成功：/models 可访问，未触发图片生成。" }), {
          status: 200,
        }),
      );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.click(screen.getByRole("button", { name: "测试连通" }));

    expect(await screen.findByText("连通测试成功：/models 可访问，未触发图片生成。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "api/connectivity",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("restores stored API URL and session API key after refresh", async () => {
    window.localStorage.setItem("gpt-image2.apiBaseUrl", "https://stored.example.com/v1");
    window.sessionStorage.setItem("gpt-image2.apiKey.session", "session-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue("https://stored.example.com/v1"));
    expect(screen.getByLabelText("API Key（可选）")).toHaveValue("session-key");
  });

  it("appends images across multiple file selections for reference requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/reference.png" }] }), { status: 200 }),
      );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.selectOptions(screen.getByLabelText("模式"), "reference");
    expect(screen.getByLabelText("上传图片")).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText("上传图片"), new File(["image-1"], "image-1.png", { type: "image/png" }));
    await userEvent.upload(screen.getByLabelText("上传图片"), new File(["image-2"], "image-2.webp", { type: "image/webp" }));
    expect(screen.getByText("已选择 2 张图片")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("创作描述"), "reference prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/reference.png");
    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    const formData = init?.body as FormData;
    expect(formData.getAll("image")).toHaveLength(2);
    expect(formData.get("image[]")).toBeNull();
  });

  it("shows a 180 second countdown while generating", async () => {
    let resolveGeneration: (response: Response) => void = () => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockReturnValueOnce(new Promise<Response>((resolve) => {
        resolveGeneration = resolve;
      }));

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.type(screen.getByLabelText("创作描述"), "countdown prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(screen.getByRole("button", { name: "生成中... 180s" })).toBeDisabled();
    resolveGeneration(new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/countdown.png" }] }), { status: 200 }));
    expect(await screen.findByRole("button", { name: "开始生成" })).toBeInTheDocument();
  });

  it("clears selected images when switching back to generate mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/generate.png" }] }), { status: 200 }),
      );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.selectOptions(screen.getByLabelText("模式"), "edit");
    await userEvent.upload(screen.getByLabelText("上传图片"), new File(["image"], "image.png", { type: "image/png" }));
    expect(screen.getByText("已选择 1 张图片")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("模式"), "generate");
    expect(screen.queryByLabelText("上传图片")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("创作描述"), "generate prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    const formData = init?.body as FormData;
    expect(formData.getAll("image")).toHaveLength(0);
  });

  it("hides API settings and omits them from sealed submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...publicConfig, defaultApiBaseUrl: "", apiSettingsEditable: false }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: [{ url: "https://cdn.example.com/sealed.png" }] }), { status: 200 }),
      );

    render(<PromptForm variant="sealed" />);

    await waitFor(() => expect(screen.queryByLabelText("API 基础地址")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("API Key（可选）")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("模式"), "reference");
    await userEvent.upload(screen.getByLabelText("上传图片"), [
      new File(["image-1"], "image-1.png", { type: "image/png" }),
      new File(["image-2"], "image-2.png", { type: "image/png" }),
    ]);
    await userEvent.type(screen.getByLabelText("创作描述"), "sealed prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/sealed.png");
    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(init?.body).toBeInstanceOf(FormData);
    const formData = init?.body as FormData;
    expect(formData.get("apiBaseUrl")).toBeNull();
    expect(formData.get("apiKey")).toBeNull();
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.getAll("image")).toHaveLength(2);
  });
});
