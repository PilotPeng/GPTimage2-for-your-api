import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PromptForm } from "@/components/PromptForm";
import { clearGenerationHistory, getGenerationHistory, saveGenerationHistoryItem } from "@/lib/client/historyStore";
import type { GenerationHistoryItem } from "@/lib/shared/types";

vi.mock("@/lib/client/historyStore", () => ({
  clearGenerationHistory: vi.fn(),
  getGenerationHistory: vi.fn(),
  saveGenerationHistoryItem: vi.fn(),
}));

const getGenerationHistoryMock = vi.mocked(getGenerationHistory);
const saveGenerationHistoryItemMock = vi.mocked(saveGenerationHistoryItem);
const clearGenerationHistoryMock = vi.mocked(clearGenerationHistory);

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
  billingEnabled: false,
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
  getGenerationHistoryMock.mockResolvedValue([]);
  saveGenerationHistoryItemMock.mockImplementation(async (item) => [item]);
  clearGenerationHistoryMock.mockResolvedValue(undefined);
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
        new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jobId: "job-1",
          status: "succeeded",
          createdAt: "2026-04-27T08:00:00.000Z",
          updatedAt: "2026-04-27T08:00:01.000Z",
          retryAfterMs: 1,
          result: { images: [{ url: "https://cdn.example.com/result.png" }] },
        }), { status: 200 }),
      );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    expect(screen.queryByLabelText("上传图片")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("创作描述"), "a tiny robot");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/result.png");
    expect(screen.getByText("a tiny robot", { selector: "strong" })).toBeInTheDocument();
    expect(saveGenerationHistoryItemMock).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "a tiny robot",
      result: { images: [{ url: "https://cdn.example.com/result.png" }] },
    }));
    expect(window.localStorage.getItem("gpt-image2.history")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/images")).toBe(true);
  });

  it("keeps API requests under sealed path without a trailing slash", async () => {
    window.history.replaceState(null, "", "/sealed");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...publicConfig, defaultApiBaseUrl: "", apiSettingsEditable: false }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jobId: "job-1",
          status: "succeeded",
          createdAt: "2026-04-27T08:00:00.000Z",
          updatedAt: "2026-04-27T08:00:01.000Z",
          retryAfterMs: 1,
          result: { images: [{ url: "https://cdn.example.com/sealed-path.png" }] },
        }), { status: 200 }),
      );

    render(<PromptForm variant="sealed" />);

    await userEvent.type(await screen.findByLabelText("创作描述"), "sealed path prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/sealed-path.png");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      "/sealed/api/config",
      "/sealed/api/images",
    ]));
    expect(fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.startsWith("/sealed/api/images/jobs/"))).not.toHaveLength(0);
  });

  it("restores stored generation history", async () => {
    getGenerationHistoryMock.mockResolvedValue([
      {
        id: "history-1",
        prompt: "stored prompt",
        mode: "generate",
        createdAt: "2026-04-27T08:00:00.000Z",
        result: { images: [{ url: "https://cdn.example.com/stored.png" }] },
      },
    ] satisfies GenerationHistoryItem[]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    expect(await screen.findByText("stored prompt")).toBeInTheDocument();
    await userEvent.click(screen.getByText("stored prompt"));
    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/stored.png");
  });

  it("clears stored generation history", async () => {
    getGenerationHistoryMock.mockResolvedValue([
      {
        id: "history-1",
        prompt: "stored prompt",
        mode: "generate",
        createdAt: "2026-04-27T08:00:00.000Z",
        result: { images: [{ url: "https://cdn.example.com/stored.png" }] },
      },
    ] satisfies GenerationHistoryItem[]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    expect(await screen.findByText("stored prompt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清空历史" }));

    expect(clearGenerationHistoryMock).toHaveBeenCalled();
    expect(screen.queryByText("stored prompt")).not.toBeInTheDocument();
  });

  it("resumes active image jobs after refresh", async () => {
    window.localStorage.setItem("gpt-image2.activeJob.configurable", JSON.stringify({
      jobId: "job-resume",
      prompt: "resume prompt",
      mode: "generate",
      createdAt: "2026-04-27T08:00:00.000Z",
      retryAfterMs: 1,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jobId: "job-resume",
        status: "succeeded",
        createdAt: "2026-04-27T08:00:00.000Z",
        updatedAt: "2026-04-27T08:00:01.000Z",
        retryAfterMs: 1,
        result: { images: [{ url: "https://cdn.example.com/resume.png" }] },
      }), { status: 200 }));

    render(<PromptForm />);

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/resume.png");
    expect(saveGenerationHistoryItemMock).toHaveBeenCalledWith(expect.objectContaining({ prompt: "resume prompt" }));
  });

  it("does not resume sealed jobs from the configurable app", async () => {
    window.localStorage.setItem("gpt-image2.activeJob.sealed", JSON.stringify({
      jobId: "sealed-job-resume",
      prompt: "sealed resume prompt",
      mode: "generate",
      createdAt: "2026-04-27T08:00:00.000Z",
      retryAfterMs: 1,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(publicConfig), { status: 200 }),
    );

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/config"]);
    expect(screen.getByRole("button", { name: "开始生成" })).toBeEnabled();
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
      "/api/connectivity",
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
        new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jobId: "job-1",
          status: "succeeded",
          createdAt: "2026-04-27T08:00:00.000Z",
          updatedAt: "2026-04-27T08:00:01.000Z",
          retryAfterMs: 1,
          result: { images: [{ url: "https://cdn.example.com/reference.png" }] },
        }), { status: 200 }),
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
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/images") ?? [];
    const formData = init?.body as FormData;
    expect(formData.getAll("image")).toHaveLength(2);
    expect(formData.get("image[]")).toBeNull();
  });

  it("shows paid account balance when billing is enabled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...publicConfig, billingEnabled: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: "user-1", email: "user@example.com", role: "user", status: "active", createdAt: "2026-04-27T08:00:00.000Z", updatedAt: "2026-04-27T08:00:00.000Z", lastLoginAt: null },
        balance: 3,
        ledgerEntries: [],
        orders: [],
      }), { status: 200 }));

    render(<PromptForm />);

    expect(await screen.findByText("账户余额：3 点")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始生成" })).toBeEnabled();
  });

  it("shows a 180 second countdown while queued", async () => {
    let resolveJob: (response: Response) => void = () => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockReturnValueOnce(new Promise<Response>((resolve) => {
        resolveJob = resolve;
      }));

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.type(screen.getByLabelText("创作描述"), "countdown prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(screen.getByRole("button", { name: "排队中... 180s" })).toBeDisabled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/config", "/api/images"]);
    resolveJob(new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }));
  });

  it("resets submit state after non-recoverable create failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INVALID_REQUEST", message: "请求参数无效。" } }), { status: 400 }));

    render(<PromptForm />);

    await waitFor(() => expect(screen.getByLabelText("API 基础地址")).toHaveValue(publicConfig.defaultApiBaseUrl));
    await userEvent.type(screen.getByLabelText("创作描述"), "invalid submit prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请求参数无效。");
    expect(screen.getByRole("button", { name: "开始生成" })).toBeEnabled();
    expect(window.localStorage.getItem("gpt-image2.activeJob.configurable")).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/config", "/api/images"]);
  });

  it("clears selected images when switching back to generate mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(publicConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jobId: "job-1",
          status: "succeeded",
          createdAt: "2026-04-27T08:00:00.000Z",
          updatedAt: "2026-04-27T08:00:01.000Z",
          retryAfterMs: 1,
          result: { images: [{ url: "https://cdn.example.com/generate.png" }] },
        }), { status: 200 }),
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

    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/images") ?? [];
    const formData = init?.body as FormData;
    expect(formData.getAll("image")).toHaveLength(0);
  });

  it("hides API settings and omits them from sealed submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...publicConfig, defaultApiBaseUrl: "", apiSettingsEditable: false }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: "job-1", status: "queued", statusUrl: "api/images/jobs/job-1", retryAfterMs: 1 }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jobId: "job-1",
          status: "succeeded",
          createdAt: "2026-04-27T08:00:00.000Z",
          updatedAt: "2026-04-27T08:00:01.000Z",
          retryAfterMs: 1,
          result: { images: [{ url: "https://cdn.example.com/sealed.png" }] },
        }), { status: 200 }),
      );

    render(<PromptForm variant="sealed" />);

    await waitFor(() => expect(screen.queryByLabelText("API 基础地址")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("API Key（可选）")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
    expect(screen.getByLabelText("尺寸（可选）")).toBeInTheDocument();
    expect(screen.getByLabelText("质量（可选）")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("模式"), "reference");
    await userEvent.upload(screen.getByLabelText("上传图片"), [
      new File(["image-1"], "image-1.png", { type: "image/png" }),
      new File(["image-2"], "image-2.png", { type: "image/png" }),
    ]);
    await userEvent.type(screen.getByLabelText("创作描述"), "sealed prompt");
    await userEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByAltText("生成图片 1")).toHaveAttribute("src", "https://cdn.example.com/sealed.png");
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/images") ?? [];
    expect(init?.body).toBeInstanceOf(FormData);
    const formData = init?.body as FormData;
    expect(formData.get("apiBaseUrl")).toBeNull();
    expect(formData.get("apiKey")).toBeNull();
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.getAll("image")).toHaveLength(2);
  });
});
