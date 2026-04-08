"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/** localStorage keys for nav tab persistence (survives route changes). */
export const TAB_PERSIST = {
  search: "thai-anki-persist-search-v1",
  batch: "thai-anki-persist-batch-v1",
  byArticle: "thai-anki-persist-by-article-v1",
  words: "thai-anki-persist-words-v1",
  workspace: "thai-anki-persist-workspace-v1",
} as const;

/**
 * Restore/save page UI state when switching top nav links (each route remounts).
 * First paint uses `initial`; after hydrate, state syncs from/to localStorage.
 */
export function useStickyTabState<T>(
  storageKey: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          setState({
            ...(initialRef.current as object),
            ...(parsed as object),
          } as T);
        }
      }
    } catch {
      /* ignore corrupt */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* quota */
    }
  }, [storageKey, state, hydrated]);

  return [state, setState, hydrated];
}
