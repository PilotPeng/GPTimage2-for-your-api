import { PromptForm } from "@/components/PromptForm";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const { uiMode } = getServerConfig();
  const isSealed = uiMode === "sealed";

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-header">
          <div className="hero-content">
            <p className="eyebrow">AI Image Studio</p>
            <h1>Let&apos;s GPTImage</h1>
            <p className="hero-copy">
              {isSealed
                ? "写下你的想法，或上传参考图，就能快速生成、改图和创作视觉素材。"
                : "连接你的图片生成服务，输入想法、上传参考图，一站式完成生成、参考创作和图片编辑。"}
            </p>
          </div>
          <div className="hero-panel" aria-label="功能亮点">
            <div className="feature-pill">
              <span>文字出图</span>
              <strong>输入一句描述，生成你想要的画面。</strong>
            </div>
            <div className="feature-pill">
              <span>参考创作</span>
              <strong>支持逐张添加多张参考图，灵感不用一次选完。</strong>
            </div>
            <div className="feature-pill">
              <span>图片编辑</span>
              <strong>{isSealed ? "无需配置，打开页面即可开始创作。" : "保留高级配置，也适合自己的 API 工作流。"}</strong>
            </div>
          </div>
        </div>
        <PromptForm variant={uiMode} />
      </section>
    </main>
  );
}
