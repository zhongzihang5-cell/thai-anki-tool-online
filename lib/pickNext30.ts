import type { WordRow } from "@/lib/runWordsCatalog";

/** 与搜索脚本一致：去空白后比较，避免同一词不同空格被当成不同条 */
export function thaiWordKey(thai: string): string {
  return thai.replace(/\s/g, "");
}

/**
 * 待录入优先，再需补充；同组按频次降序，最多 `count` 个。
 * `excludeKeys`：已在本轮展示过的泰文（经 thaiWordKey）。
 * `shelvedKeys`：用户搁置的词，永不进入待处理队列。
 */
export function pickNextBatch(
  words: WordRow[],
  count: number,
  excludeKeys?: ReadonlySet<string>,
  shelvedKeys?: ReadonlySet<string>
): WordRow[] {
  const ex = excludeKeys ?? new Set<string>();
  const sh = shelvedKeys ?? new Set<string>();
  const pen = words
    .filter(
      (w) =>
        w.status === "pending" &&
        !ex.has(thaiWordKey(w.thai)) &&
        !sh.has(thaiWordKey(w.thai))
    )
    .sort((a, b) => b.frequency - a.frequency);
  const sup = words
    .filter(
      (w) =>
        w.status === "supplement" &&
        !ex.has(thaiWordKey(w.thai)) &&
        !sh.has(thaiWordKey(w.thai))
    )
    .sort((a, b) => b.frequency - a.frequency);
  const n = Math.max(1, Math.min(200, Math.floor(count) || 30));
  return [...pen, ...sup].slice(0, n);
}

/** @deprecated 使用 pickNextBatch(words, 30, excludeKeys) */
export function pickNext30(words: WordRow[], excludeKeys?: ReadonlySet<string>): WordRow[] {
  return pickNextBatch(words, 30, excludeKeys, undefined);
}
