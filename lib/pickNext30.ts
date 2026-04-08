import type { WordRow } from "@/lib/runWordsCatalog";

/** 与搜索脚本一致：去空白后比较，避免同一词不同空格被当成不同条 */
export function thaiWordKey(thai: string): string {
  return thai.replace(/\s/g, "");
}

/**
 * 待录入优先，再需补充；同组按频次降序，最多 30 个。
 * `excludeKeys`：已在本页展示过的泰文（经 thaiWordKey），本次跳过。
 */
export function pickNext30(words: WordRow[], excludeKeys?: ReadonlySet<string>): WordRow[] {
  const ex = excludeKeys ?? new Set<string>();
  const pen = words
    .filter((w) => w.status === "pending" && !ex.has(thaiWordKey(w.thai)))
    .sort((a, b) => b.frequency - a.frequency);
  const sup = words
    .filter((w) => w.status === "supplement" && !ex.has(thaiWordKey(w.thai)))
    .sort((a, b) => b.frequency - a.frequency);
  return [...pen, ...sup].slice(0, 30);
}
