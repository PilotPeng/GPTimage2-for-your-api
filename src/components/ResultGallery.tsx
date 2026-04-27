import type { GenerationHistoryItem } from "./PromptForm";
import type { ImageGenerationResponse } from "@/lib/shared/types";

type ResultGalleryProps = Readonly<{
  result?: ImageGenerationResponse;
  history: readonly GenerationHistoryItem[];
  onClearHistory: () => void;
  onSelectHistory: (item: GenerationHistoryItem) => void;
}>;

const modeLabels = {
  generate: "文字生成",
  reference: "参考创作",
  edit: "图片编辑",
} as const;

const getImageSource = (image: ImageGenerationResponse["images"][number]) => {
  if (image.url) {
    return image.url;
  }

  if (image.b64) {
    const mimeType = image.mimeType ?? "image/png";
    return image.b64.startsWith("data:") ? image.b64 : `data:${mimeType};base64,${image.b64}`;
  }

  return undefined;
};

const formatHistoryTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

export function ResultGallery({ result, history, onClearHistory, onSelectHistory }: ResultGalleryProps) {
  return (
    <section className="result-card" aria-label="生成结果">
      {result && result.images.length > 0 ? (
        <>
          <div className="section-heading">
            <h2>生成结果</h2>
            {result.providerRequestId ? <span>Request ID: {result.providerRequestId}</span> : null}
          </div>
          <div className="result-grid">
            {result.images.map((image, index) => {
              const source = getImageSource(image);

              if (!source) {
                return null;
              }

              return (
                <figure className="result-item" key={`${source.slice(0, 48)}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={source} alt={`生成图片 ${index + 1}`} />
                  <figcaption>
                    <a href={source} download={`gpt-image2-${index + 1}.png`} target="_blank" rel="noreferrer">
                      下载图片
                    </a>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-result">
          <h2>作品会显示在这里</h2>
          <p>生成成功后，可以下载图片，也能在下方历史记录里重新查看。</p>
        </div>
      )}

      <div className="history-panel">
        <div className="history-heading">
          <div>
            <h3>最近生成</h3>
            <span>仅保存在当前浏览器，不保存上传原图。</span>
          </div>
          {history.length > 0 ? (
            <button type="button" className="secondary-button" onClick={onClearHistory}>
              清空历史
            </button>
          ) : null}
        </div>
        {history.length > 0 ? (
          <div className="history-list">
            {history.map((item) => {
              const firstImage = item.result.images[0];
              const thumbnail = firstImage ? getImageSource(firstImage) : undefined;

              return (
                <button type="button" className="history-item" key={item.id} onClick={() => onSelectHistory(item)}>
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail} alt="历史生成缩略图" />
                  ) : null}
                  <span>
                    <strong>{item.prompt}</strong>
                    <small>{modeLabels[item.mode]} · {formatHistoryTime(item.createdAt)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="history-empty">暂无历史记录。</p>
        )}
      </div>
    </section>
  );
}
