import type { ImageGenerationResponse } from "@/lib/shared/types";

type ResultGalleryProps = Readonly<{
  result?: ImageGenerationResponse;
}>;

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

export function ResultGallery({ result }: ResultGalleryProps) {
  if (!result || result.images.length === 0) {
    return null;
  }

  return (
    <section className="result-card" aria-label="生成结果">
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
    </section>
  );
}
