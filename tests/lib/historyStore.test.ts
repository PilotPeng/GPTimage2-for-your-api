import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearGenerationHistory, getGenerationHistory, saveGenerationHistoryItem } from "@/lib/client/historyStore";
import type { GenerationHistoryItem } from "@/lib/shared/types";

const createHistoryItem = (id: string, createdAt: string): GenerationHistoryItem => ({
  id,
  prompt: `prompt ${id}`,
  mode: "generate",
  createdAt,
  result: { images: [{ b64: `image-${id}`, mimeType: "image/png" }] },
});

const deleteDatabase = () => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("gpt-image2");

  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error ?? new Error("删除测试数据库失败。"));
  request.onblocked = () => reject(new Error("删除测试数据库被阻塞。"));
});

describe("historyStore", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await deleteDatabase();
  });

  it("saves and loads generation history from IndexedDB", async () => {
    const item = createHistoryItem("history-1", "2026-04-27T08:00:00.000Z");

    await saveGenerationHistoryItem(item);

    expect(await getGenerationHistory()).toEqual([item]);
    expect(window.localStorage.getItem("gpt-image2.history")).toBeNull();
  });

  it("keeps only the latest 8 generation history items", async () => {
    for (let index = 0; index < 9; index += 1) {
      await saveGenerationHistoryItem(createHistoryItem(`history-${index}`, `2026-04-27T08:0${index}:00.000Z`));
    }

    const history = await getGenerationHistory();

    expect(history).toHaveLength(8);
    expect(history.map((item) => item.id)).toEqual([
      "history-8",
      "history-7",
      "history-6",
      "history-5",
      "history-4",
      "history-3",
      "history-2",
      "history-1",
    ]);
  });

  it("clears generation history", async () => {
    await saveGenerationHistoryItem(createHistoryItem("history-1", "2026-04-27T08:00:00.000Z"));

    await clearGenerationHistory();

    expect(await getGenerationHistory()).toEqual([]);
  });

  it("migrates legacy localStorage history once", async () => {
    const legacyItem = createHistoryItem("legacy-history", "2026-04-27T08:00:00.000Z");
    window.localStorage.setItem("gpt-image2.history", JSON.stringify([legacyItem]));

    expect(await getGenerationHistory()).toEqual([legacyItem]);
    expect(window.localStorage.getItem("gpt-image2.history")).toBeNull();
    expect(await getGenerationHistory()).toEqual([legacyItem]);
  });
});
