import type { ByArticleArticle } from "@/lib/runArticleSearch";

/** 从文件名提取文章编号，数字前缀补足三位（如 3 → 003） */
export function articleNumberFromArticle(a: ByArticleArticle): string {
  const base = a.fileName.replace(/\.[^.]+$/i, "");
  const m = base.match(/^(\d+)/);
  if (m) {
    const raw = m[1];
    return /^\d+$/.test(raw) ? raw.padStart(3, "0") : raw;
  }
  const any = base.match(/(\d{2,4})/);
  if (any && /^\d+$/.test(any[1])) return any[1].padStart(3, "0");
  return base.length > 14 ? `${base.slice(0, 12)}…` : base || "—";
}
