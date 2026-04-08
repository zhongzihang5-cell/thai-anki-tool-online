import type { ReactNode } from "react";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在正文中高亮本批词语（按长度优先匹配） */
export function highlightThaiWordsInText(text: string, thaiWords: string[]): ReactNode {
  const keys = [
    ...new Set(
      thaiWords.map((w) => w.trim()).filter(Boolean)
    ),
  ].sort((a, b) => b.length - a.length);
  if (keys.length === 0) return text;
  const pattern = keys.map(escapeRe).join("|");
  if (!pattern) return text;
  let re: RegExp;
  try {
    re = new RegExp(`(${pattern})`, "gu");
  } catch {
    return text;
  }
  const parts = text.split(re);
  return parts.map((part, i) => {
    const hit = keys.some((k) => part === k);
    return hit ? (
      <mark
        key={i}
        className="rounded bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-900/55"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}
