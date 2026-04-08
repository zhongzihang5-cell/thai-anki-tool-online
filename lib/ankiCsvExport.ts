import type { WordRow } from "@/lib/runWordsCatalog";

export type Next30DraftRow = {
  ex1Thai: string;
  ex1Ipa: string;
  ex1Zh: string;
  ex2Thai: string;
  ex2Ipa: string;
  ex2Zh: string;
  ex3Thai: string;
  ex3Ipa: string;
  ex3Zh: string;
};

export function emptyDraft(): Next30DraftRow {
  return {
    ex1Thai: "",
    ex1Ipa: "",
    ex1Zh: "",
    ex2Thai: "",
    ex2Ipa: "",
    ex2Zh: "",
    ex3Thai: "",
    ex3Ipa: "",
    ex3Zh: "",
  };
}

function soundTag(text: string): string {
  const t = text.trim().replace(/\//g, "、");
  if (!t) return "";
  return `[sound:${t}.wav]`;
}

export const ANKI_CSV_HEADERS = [
  "泰语",
  "音标",
  "中文",
  "[sound:泰语.wav]",
  "[sound:中文.wav]",
  "泰文例句",
  "泰文例句音标",
  "[sound:泰文例句.wav]",
  "例句中文翻译",
  "[sound:例句中文翻译.wav]",
  "泰文例句2",
  "泰文例句音标2",
  "[sound:泰文例句2.wav]",
  "例句中文翻译2",
  "[sound:例句中文翻译2.wav]",
  "泰文例句3",
  "泰文例句音标3",
  "[sound:泰文例句3.wav]",
  "例句中文翻译3",
  "[sound:例句中文翻译3.wav]",
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAnkiImportRow(w: WordRow, d: Next30DraftRow): string[] {
  const thai = w.thai.trim();
  const ipa = (w.ipa || "").trim();
  const zh = (w.chinese || "").trim();
  const t1 = d.ex1Thai.trim();
  const i1 = d.ex1Ipa.trim();
  const z1 = d.ex1Zh.trim();
  const t2 = d.ex2Thai.trim();
  const i2 = d.ex2Ipa.trim();
  const z2 = d.ex2Zh.trim();
  const t3 = d.ex3Thai.trim();
  const i3 = d.ex3Ipa.trim();
  const z3 = d.ex3Zh.trim();
  return [
    thai,
    ipa,
    zh,
    soundTag(thai),
    soundTag(zh),
    t1,
    i1,
    soundTag(t1),
    z1,
    soundTag(z1),
    t2,
    i2,
    soundTag(t2),
    z2,
    soundTag(z2),
    t3,
    i3,
    soundTag(t3),
    z3,
    soundTag(z3),
  ];
}

export function buildAnkiImportCsv(rows: WordRow[], drafts: Next30DraftRow[]): string {
  const lines: string[] = [
    ANKI_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(","),
    ...rows.map((w, i) =>
      buildAnkiImportRow(w, drafts[i] ?? emptyDraft())
        .map((c) => escapeCsvCell(c))
        .join(",")
    ),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 已满足「需例句数」的词条数量 */
export function countCompletedDrafts(words: WordRow[], drafts: Next30DraftRow[]): number {
  return words.reduce((acc, w, i) => {
    const d = drafts[i] ?? emptyDraft();
    const req = Math.min(3, Math.max(1, w.requiredExamples));
    const slots = [d.ex1Thai.trim(), d.ex2Thai.trim(), d.ex3Thai.trim()];
    for (let j = 0; j < req; j++) {
      if (!slots[j]) return acc;
    }
    return acc + 1;
  }, 0);
}
