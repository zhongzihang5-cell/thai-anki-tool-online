import type { ByArticleArticle } from "@/lib/runArticleSearch";

const PREFIX = "thai-anki-byArticleCache:";

/** 与请求体 words 数组完全一致（顺序敏感，与脚本 unique_ordered 输入一致） */
export function byArticleRequestCacheKey(words: string[]): string {
  return `${PREFIX}${words.join("\0")}`;
}

export function getCachedByArticleArticles(key: string): ByArticleArticle[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as ByArticleArticle[];
  } catch {
    return null;
  }
}

export function setCachedByArticleArticles(
  key: string,
  articles: ByArticleArticle[]
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(articles));
  } catch {
    /* quota — ignore */
  }
}

export function clearAllByArticleSessionCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * 相同词表请求命中 sessionStorage，避免切换页面后重复打满量 by-article。
 * 词表刷新后应调用 clearAllByArticleSessionCache。
 */
export async function fetchByArticleWithSessionCache(words: string[]): Promise<
  | { ok: true; articles: ByArticleArticle[] }
  | { ok: false; error: string; status: number }
> {
  if (words.length === 0) {
    return { ok: true, articles: [] };
  }
  const key = byArticleRequestCacheKey(words);
  const hit = getCachedByArticleArticles(key);
  if (hit) {
    return { ok: true, articles: hit };
  }
  const r = await fetch("/api/by-article", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
  const d = (await r.json()) as {
    articles?: ByArticleArticle[];
    error?: string;
  };
  if (!r.ok) {
    return {
      ok: false,
      error: d.error || `选篇失败 ${r.status}`,
      status: r.status,
    };
  }
  const articles = d.articles ?? [];
  setCachedByArticleArticles(key, articles);
  return { ok: true, articles };
}
