import type { GenerationHistoryItem } from "@/lib/shared/types";

const DATABASE_NAME = "gpt-image2";
const DATABASE_VERSION = 1;
const HISTORY_STORE_NAME = "generationHistory";
const MAX_HISTORY_ITEMS = 8;
const LEGACY_HISTORY_STORAGE_KEY = "gpt-image2.history";

const openHistoryDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
      database.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("无法打开历史记录数据库。"));
});

const runHistoryTransaction = async <Result>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<Result>,
) => {
  const database = await openHistoryDatabase();

  return new Promise<Result>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE_NAME, mode);
    const request = operation(transaction.objectStore(HISTORY_STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("历史记录操作失败。"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("历史记录操作失败。"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("历史记录操作失败。"));
    };
  });
};

const isGenerationHistoryItem = (item: unknown): item is GenerationHistoryItem => {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const record = item as Partial<GenerationHistoryItem>;
  return (
    typeof record.id === "string" &&
    typeof record.prompt === "string" &&
    typeof record.createdAt === "string" &&
    (record.mode === "generate" || record.mode === "reference" || record.mode === "edit") &&
    typeof record.result === "object" &&
    record.result !== null &&
    Array.isArray(record.result.images)
  );
};

const parseLegacyHistory = (value: string | null) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isGenerationHistoryItem) : [];
  } catch {
    return [];
  }
};

const sortHistory = (items: readonly GenerationHistoryItem[]) => [...items].sort((left, right) => (
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
));

const replaceGenerationHistory = async (items: readonly GenerationHistoryItem[]) => {
  const database = await openHistoryDatabase();
  const nextHistory = sortHistory(items).slice(0, MAX_HISTORY_ITEMS);

  return new Promise<GenerationHistoryItem[]>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE_NAME);

    store.clear();

    for (const item of nextHistory) {
      store.put(item);
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(nextHistory);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("保存历史记录失败。"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("保存历史记录失败。"));
    };
  });
};

const migrateLegacyHistory = async (history: readonly GenerationHistoryItem[]): Promise<GenerationHistoryItem[]> => {
  const legacyHistory = parseLegacyHistory(window.localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY));

  if (legacyHistory.length === 0) {
    window.localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
    return [...history];
  }

  const existingIds = new Set(history.map((item) => item.id));
  const migratedHistory = sortHistory([
    ...history,
    ...legacyHistory.filter((item) => !existingIds.has(item.id)),
  ]).slice(0, MAX_HISTORY_ITEMS);
  const savedHistory = await replaceGenerationHistory(migratedHistory);

  window.localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
  return savedHistory;
};

export const getGenerationHistory = async (): Promise<GenerationHistoryItem[]> => {
  const history = await runHistoryTransaction<GenerationHistoryItem[]>("readonly", (store) => store.getAll());
  const currentHistory = sortHistory(history).slice(0, MAX_HISTORY_ITEMS);

  if (typeof window === "undefined") {
    return currentHistory;
  }

  return migrateLegacyHistory(currentHistory);
};

export const saveGenerationHistoryItem = async (item: GenerationHistoryItem) => {
  const database = await openHistoryDatabase();

  return new Promise<GenerationHistoryItem[]>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const nextHistory = sortHistory([item, ...getAllRequest.result]).slice(0, MAX_HISTORY_ITEMS);
      const staleHistory = getAllRequest.result.filter((historyItem) => !nextHistory.some((nextItem) => nextItem.id === historyItem.id));

      store.put(item);

      for (const staleItem of staleHistory) {
        store.delete(staleItem.id);
      }
    };

    getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error("读取历史记录失败。"));
    transaction.oncomplete = () => {
      database.close();
      resolve(getGenerationHistory());
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("保存历史记录失败。"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("保存历史记录失败。"));
    };
  });
};

export const clearGenerationHistory = () => runHistoryTransaction<undefined>("readwrite", (store) => store.clear());
