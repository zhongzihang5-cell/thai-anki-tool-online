import { pickNextBatch, thaiWordKey } from "@/lib/pickNext30";
import type { ByArticleArticle } from "@/lib/runArticleSearch";
import type { WordRow } from "@/lib/runWordsCatalog";

/** 待录入 + 需补充，排除搁置；顺序与 pickNextBatch 一致（频次降序，先 pending 再 supplement） */
export function eligibleWorkflowRows(
  catalog: WordRow[],
  shelvedKeys: ReadonlySet<string>
): WordRow[] {
  const sh = shelvedKeys;
  const pen = catalog
    .filter((w) => w.status === "pending" && !sh.has(thaiWordKey(w.thai)))
    .sort((a, b) => b.frequency - a.frequency);
  const sup = catalog
    .filter((w) => w.status === "supplement" && !sh.has(thaiWordKey(w.thai)))
    .sort((a, b) => b.frequency - a.frequency);
  return [...pen, ...sup];
}

export function filterExcluded(
  rows: WordRow[],
  excludeKeys: ReadonlySet<string>
): WordRow[] {
  return rows.filter((w) => !excludeKeys.has(thaiWordKey(w.thai)));
}

export function articleForBatchDisplay(
  article: ByArticleArticle,
  batch: WordRow[]
): ByArticleArticle {
  const keys = new Set(batch.map((w) => thaiWordKey(w.thai)));
  const words = article.words.filter((h) => keys.has(thaiWordKey(h.word)));
  return {
    ...article,
    words,
    wordCount: words.length,
  };
}

function capN(n: number): number {
  return Math.max(1, Math.min(200, Math.floor(n) || 30));
}

/**
 * 从 greedy 计划的第一篇文章取出本批词：先按本篇命中建行，再按频次降序，最多 cap 个。
 */
export function buildBatchFromFirstArticle(
  first: ByArticleArticle,
  catalogByKey: Map<string, WordRow>,
  cap: number
): { batch: WordRow[]; totalInArticle: number; wasCapped: boolean } {
  const n = capN(cap);
  const rows: WordRow[] = [];
  const seen = new Set<string>();
  for (const hit of first.words) {
    const k = thaiWordKey(hit.word);
    if (!k || seen.has(k)) continue;
    const row = catalogByKey.get(k);
    if (!row) continue;
    seen.add(k);
    rows.push(row);
  }
  rows.sort((a, b) => b.frequency - a.frequency);
  const totalInArticle = rows.length;
  const wasCapped = totalInArticle > n;
  return { batch: rows.slice(0, n), totalInArticle, wasCapped };
}

export type ResolveArticleBatchResult =
  | {
      ok: true;
      batch: WordRow[];
      /** 贪心首篇（覆盖当前 eligible 集最多的文章）；频次回退时为 null */
      focusArticle: ByArticleArticle | null;
      totalInArticle: number;
      wasCapped: boolean;
    }
  | { ok: false; error: string };

/**
 * 对「当前仍参与选篇」的 eligible 词调用 by_article 后，用返回的 articles[0] 组批；若无篇或组批为空则退回 pickNextBatch。
 */
export function resolveWorkflowArticleBatch(args: {
  catalog: WordRow[];
  articles: ByArticleArticle[];
  shelvedKeys: ReadonlySet<string>;
  consumedKeys: ReadonlySet<string>;
  cap: number;
}): ResolveArticleBatchResult {
  const eligible = filterExcluded(
    eligibleWorkflowRows(args.catalog, args.shelvedKeys),
    args.consumedKeys
  );
  if (eligible.length === 0) {
    return {
      ok: false,
      error:
        args.consumedKeys.size > 0
          ? "没有更多待处理词（可能已全部进入上一批或已搁置）。可刷新词表或恢复搁置。"
          : "没有可取的待录入/需补充词（可能已全部搁置）。可在单词管理恢复搁置。",
    };
  }

  const catalogByKey = new Map<string, WordRow>();
  for (const w of args.catalog) {
    catalogByKey.set(thaiWordKey(w.thai), w);
  }

  if (args.articles.length > 0) {
    const first = args.articles[0];
    const { batch, totalInArticle, wasCapped } = buildBatchFromFirstArticle(
      first,
      catalogByKey,
      args.cap
    );
    if (batch.length > 0) {
      return {
        ok: true,
        batch,
        focusArticle: first,
        totalInArticle,
        wasCapped,
      };
    }
  }

  const fb = pickNextBatch(
    args.catalog,
    args.cap,
    args.consumedKeys,
    args.shelvedKeys
  );
  if (fb.length === 0) {
    return {
      ok: false,
      error:
        "未能从文章中组批，且按频次也无法取词。请刷新词表或检查数据源。",
    };
  }
  return {
    ok: true,
    batch: fb,
    focusArticle: null,
    totalInArticle: fb.length,
    wasCapped: false,
  };
}
