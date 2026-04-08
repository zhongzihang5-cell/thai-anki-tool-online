/** 浏览器端「搁置」词（不参与待处理队列） */

export const SHELVED_LS_KEY = "thai-anki-shelved-v1";

export function loadShelvedKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SHELVED_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

export function saveShelvedKeys(keys: Set<string>): void {
  try {
    localStorage.setItem(SHELVED_LS_KEY, JSON.stringify([...keys]));
  } catch {
    /* quota */
  }
}

export function isShelvedKey(keys: Set<string>, thai: string): boolean {
  return keys.has(thai.replace(/\s/g, ""));
}
