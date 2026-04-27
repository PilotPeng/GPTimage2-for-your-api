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
            <p className="eyebrow">{isSealed ? "GPT-image2 Sealed Studio" : "GPT-image2 Web Studio"}</p>
            <h1>{isSealed ? "用预设接口生成和编辑图片" : "用你自己的接口生成和编辑图片"}</h1>
            <p className="hero-copy">
              {isSealed
                ? "只需输入 prompt 和可选图片，本站后端会使用服务器预设 API 安全转发请求。"
                : "输入 API 基础地址、prompt 和可选图片后，本站后端会安全转发请求，自动匹配生成或编辑接口。"}
            </p>
          </div>
          <div className="hero-panel" aria-label="功能亮点">
            <div className="feature-pill">
              <span>自动拼接</span>
              <strong>/images/generations 或 /images/edits</strong>
            </div>
            <div className="feature-pill">
              <span>Key 保护</span>
              <strong>{isSealed ? "API Key 只保存在服务器环境变量中" : "仅随本次请求转发，不写入本地存储"}</strong>
            </div>
            <div className="feature-pill">
              <span>轻量连通</span>
              <strong>优先请求 /models，不触发图片生成</strong>
            </div>
          </div>
        </div>
        <PromptForm variant={uiMode} />
      </section>
    </main>
  );
}
