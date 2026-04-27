"use client";

import { FormEvent, useEffect, useState } from "react";
import { ErrorMessage } from "./ErrorMessage";
import { ImageUploader } from "./ImageUploader";
import { ResultGallery } from "./ResultGallery";
import { fetchPublicConfig, generateImage, testConnectivity, type PublicConfig } from "@/lib/client/imageApi";
import type { ImageGenerationResponse, ImageMode, UiMode } from "@/lib/shared/types";

const GENERATION_COUNTDOWN_SECONDS = 180;

const fallbackConfig: PublicConfig = {
  defaultApiBaseUrl: "",
  defaultModel: "gpt-image2",
  requiresSitePassword: false,
  maxUploadBytes: 10_485_760,
  maxUploadCount: 4,
  maxTotalUploadBytes: 41_943_040,
  allowedImageMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  apiSettingsEditable: true,
  serverApiConfigured: false,
};

const storageKeys = {
  apiBaseUrl: "gpt-image2.apiBaseUrl",
  apiKey: "gpt-image2.apiKey.session",
  sitePassword: "gpt-image2.sitePassword.session",
  model: "gpt-image2.model",
  size: "gpt-image2.size",
  quality: "gpt-image2.quality",
  history: "gpt-image2.history",
} as const;

const MAX_HISTORY_ITEMS = 8;

const getStoredValue = (key: string) => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(key) ?? "";
};

const getSessionValue = (key: string) => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(key) ?? "";
};

const parseHistory = (value: string | null): GenerationHistoryItem[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is GenerationHistoryItem => {
      if (typeof item !== "object" || item === null) {
        return false;
      }

      const record = item as Partial<GenerationHistoryItem>;
      return (
        typeof record.id === "string" &&
        typeof record.prompt === "string" &&
        typeof record.createdAt === "string" &&
        typeof record.result === "object" &&
        record.result !== null &&
        Array.isArray(record.result.images)
      );
    });
  } catch {
    return [];
  }
};

const createHistoryItem = (prompt: string, mode: ImageMode, result: ImageGenerationResponse): GenerationHistoryItem => ({
  id: `${Date.now()}-${crypto.randomUUID()}`,
  prompt,
  mode,
  createdAt: new Date().toISOString(),
  result,
});

export type GenerationHistoryItem = Readonly<{
  id: string;
  prompt: string;
  mode: ImageMode;
  createdAt: string;
  result: ImageGenerationResponse;
}>;

type PromptFormProps = Readonly<{
  variant?: UiMode;
}>;

export function PromptForm({ variant = "configurable" }: PromptFormProps) {
  const isConfigurable = variant === "configurable";
  const [config, setConfig] = useState<PublicConfig>(fallbackConfig);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sitePassword, setSitePassword] = useState("");
  const [model, setModel] = useState("gpt-image2");
  const [size, setSize] = useState("");
  const [quality, setQuality] = useState("");
  const [mode, setMode] = useState<ImageMode>("generate");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [result, setResult] = useState<ImageGenerationResponse>();
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [connectivityMessage, setConnectivityMessage] = useState("");
  const [isTestingConnectivity, setIsTestingConnectivity] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(GENERATION_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!isSubmitting) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCountdownSeconds((currentSeconds) => Math.max(0, currentSeconds - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSubmitting]);

  useEffect(() => {
    let isMounted = true;

    fetchPublicConfig()
      .then((publicConfig) => {
        if (!isMounted) {
          return;
        }

        const storedApiBaseUrl = isConfigurable ? getStoredValue(storageKeys.apiBaseUrl) : "";
        const storedModel = getStoredValue(storageKeys.model);
        setConfig(publicConfig);
        setApiBaseUrl(isConfigurable ? storedApiBaseUrl || publicConfig.defaultApiBaseUrl : "");
        setApiKey(isConfigurable ? getSessionValue(storageKeys.apiKey) : "");
        setSitePassword(getSessionValue(storageKeys.sitePassword));
        setModel(storedModel || publicConfig.defaultModel);
        setSize(getStoredValue(storageKeys.size));
        setQuality(getStoredValue(storageKeys.quality));
        setHistory(parseHistory(window.localStorage.getItem(storageKeys.history)));
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setError("读取服务器配置失败，请刷新页面重试。");
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigurable]);

  const updateApiBaseUrl = (value: string) => {
    setApiBaseUrl(value);
    window.localStorage.setItem(storageKeys.apiBaseUrl, value);
  };

  const updateApiKey = (value: string) => {
    setApiKey(value);
    window.sessionStorage.setItem(storageKeys.apiKey, value);
  };

  const updateSitePassword = (value: string) => {
    setSitePassword(value);
    window.sessionStorage.setItem(storageKeys.sitePassword, value);
  };

  const updateModel = (value: string) => {
    setModel(value);
    window.localStorage.setItem(storageKeys.model, value);
  };

  const updateSize = (value: string) => {
    setSize(value);
    window.localStorage.setItem(storageKeys.size, value);
  };

  const updateQuality = (value: string) => {
    setQuality(value);
    window.localStorage.setItem(storageKeys.quality, value);
  };

  const updateMode = (nextMode: ImageMode) => {
    setMode(nextMode);

    if (nextMode === "generate") {
      setImages([]);
    }
  };

  const saveHistoryItem = (item: GenerationHistoryItem) => {
    const nextHistory = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
    setHistory(nextHistory);
    window.localStorage.setItem(storageKeys.history, JSON.stringify(nextHistory));
  };

  const clearHistory = () => {
    setHistory([]);
    window.localStorage.removeItem(storageKeys.history);
  };

  const validateClientInput = () => {
    if (isConfigurable && !apiBaseUrl.trim()) {
      return "请输入 API 基础地址。";
    }

    if (!isConfigurable && !config.serverApiConfigured) {
      return "服务器还没有配置默认 API 地址或 API Key。";
    }

    if (!prompt.trim()) {
      return "请输入创作描述。";
    }

    if (mode === "generate") {
      return "";
    }

    if (images.length === 0) {
      return "参考图或编辑模式需要上传图片。";
    }

    if (images.length > config.maxUploadCount) {
      return `最多只能上传 ${config.maxUploadCount} 张图片。`;
    }

    if (images.some((image) => !config.allowedImageMimeTypes.includes(image.type))) {
      return "图片格式仅支持 PNG、JPEG 或 WebP。";
    }

    if (images.some((image) => image.size > config.maxUploadBytes)) {
      return "单张图片文件过大，请压缩后再上传。";
    }

    if (images.reduce((total, image) => total + image.size, 0) > config.maxTotalUploadBytes) {
      return "图片总大小过大，请压缩后再上传。";
    }

    return "";
  };

  const handleConnectivityTest = async () => {
    if (!apiBaseUrl.trim()) {
      setError("请输入 API 基础地址。");
      return;
    }

    setError("");
    setConnectivityMessage("");
    setIsTestingConnectivity(true);

    try {
      const response = await testConnectivity({
        apiBaseUrl,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(sitePassword.trim() ? { sitePassword: sitePassword.trim() } : {}),
      });
      setConnectivityMessage(response.message);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "连通测试失败。");
    } finally {
      setIsTestingConnectivity(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateClientInput();

    if (validationError) {
      setError(validationError);
      return;
    }

    setCountdownSeconds(GENERATION_COUNTDOWN_SECONDS);
    setIsSubmitting(true);
    setError("");
    setConnectivityMessage("");
    setResult(undefined);

    try {
      const response = await generateImage({
        prompt,
        mode,
        ...(isConfigurable && apiBaseUrl.trim() ? { apiBaseUrl: apiBaseUrl.trim() } : {}),
        ...(isConfigurable && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(size.trim() ? { size: size.trim() } : {}),
        ...(quality.trim() ? { quality: quality.trim() } : {}),
        ...(sitePassword.trim() ? { sitePassword: sitePassword.trim() } : {}),
        ...(mode !== "generate" ? { images } : {}),
      });
      setResult(response);
      saveHistoryItem(createHistoryItem(prompt.trim(), mode, response));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setPrompt("");
    setImages([]);
    setResult(undefined);
    setError("");
    setConnectivityMessage("");
  };

  return (
    <div className="workspace-grid">
      <form className="generator-card" onSubmit={handleSubmit} noValidate>
        <div className="section-heading">
          <h2>创作设置</h2>
          <span>{mode === "generate" ? "适合从文字直接生成图片" : "适合结合参考图生成或编辑"}</span>
        </div>

        {config.requiresSitePassword ? (
          <div className="field-group">
            <label htmlFor="sitePassword">网站访问密码</label>
            <input
              id="sitePassword"
              type="password"
              value={sitePassword}
              onChange={(event) => updateSitePassword(event.target.value)}
              placeholder="部署时配置的访问密码"
            />
          </div>
        ) : null}

        {isConfigurable ? (
          <>
            <div className="field-group">
              <label htmlFor="apiBaseUrl">API 基础地址</label>
              <input
                id="apiBaseUrl"
                type="url"
                value={apiBaseUrl}
                onChange={(event) => updateApiBaseUrl(event.target.value)}
                placeholder="https://api.vbcode.io/v1"
                required
              />
              <p className="field-help">只填 API 的基础地址即可，系统会根据创作模式自动选择对应接口。</p>
            </div>

            <div className="field-group">
              <label htmlFor="apiKey">API Key（可选）</label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(event) => updateApiKey(event.target.value)}
                placeholder="留空时使用服务器环境变量"
                autoComplete="off"
              />
              <p className="field-help">API Key 仅暂存在当前浏览器标签页，刷新不丢，关闭标签页后清除。</p>
            </div>

            <div className="button-row compact-row">
              <button className="secondary-button" type="button" onClick={handleConnectivityTest} disabled={isTestingConnectivity}>
                {isTestingConnectivity ? "测试中..." : "测试连通"}
              </button>
              {connectivityMessage ? <span className="inline-status">{connectivityMessage}</span> : null}
            </div>
          </>
        ) : (
          <div className="sealed-notice">
            <strong>已为你准备好创作环境</strong>
            <span>直接输入描述，选择模式，需要时上传图片即可开始。</span>
          </div>
        )}

        <div className="settings-row">
          <div className="field-group">
            <label htmlFor="mode">模式</label>
            <select id="mode" value={mode} onChange={(event) => updateMode(event.target.value as ImageMode)}>
              <option value="generate">纯文本生成</option>
              <option value="reference">参考图生成</option>
              <option value="edit">编辑原图</option>
            </select>
          </div>
          {isConfigurable ? (
            <div className="field-group">
              <label htmlFor="model">模型</label>
              <input id="model" value={model} onChange={(event) => updateModel(event.target.value)} />
            </div>
          ) : null}
        </div>

        <div className="settings-row">
          <div className="field-group">
            <label htmlFor="size">尺寸（可选）</label>
            <input id="size" value={size} onChange={(event) => updateSize(event.target.value)} placeholder="1024x1024" />
          </div>
          <div className="field-group">
            <label htmlFor="quality">质量（可选）</label>
            <input id="quality" value={quality} onChange={(event) => updateQuality(event.target.value)} placeholder="high" />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="prompt">创作描述</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：一张温暖的咖啡馆海报，复古胶片风格，柔和光线"
            rows={7}
            required
          />
        </div>

        {mode === "generate" ? null : (
          <ImageUploader
            value={images}
            allowedTypes={config.allowedImageMimeTypes}
            maxBytes={config.maxUploadBytes}
            maxCount={config.maxUploadCount}
            maxTotalBytes={config.maxTotalUploadBytes}
            onChange={setImages}
          />
        )}

        <ErrorMessage message={error} />

        <div className="button-row">
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? `生成中... ${countdownSeconds}s` : "开始生成"}
          </button>
          <button className="secondary-button" type="button" onClick={resetForm} disabled={isSubmitting}>
            清空
          </button>
        </div>
      </form>

      <ResultGallery
        history={history}
        result={result}
        onClearHistory={clearHistory}
        onSelectHistory={(item) => setResult(item.result)}
      />
    </div>
  );
}
