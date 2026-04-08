import type { WordRow } from "@/lib/runWordsCatalog";

/** 待录入优先，再需补充；同组按频次降序，最多 30 个 */
export function pickNext30(words: WordRow[]): WordRow[] {
  const pen = words
    .filter((w) => w.status === "pending")
    .sort((a, b) => b.frequency - a.frequency);
  const sup = words
    .filter((w) => w.status === "supplement")
    .sort((a, b) => b.frequency - a.frequency);
  return [...pen, ...sup].slice(0, 30);
}
