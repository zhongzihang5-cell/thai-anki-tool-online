#!/usr/bin/env python3
"""
Search Thai article folders for example sentences containing a target word.
Normalization: whitespace removed before substring match.
Reads JSON from stdin:
  {"mode":"single","query":"..."} | {"mode":"batch","words":["..."]} | {"mode":"by_article","words":["..."]}
  | {"mode":"words_in_article_number","articleNumber":"003","words":["..."],"source":"all"|"official"|"wechat"}
by_article: greedy minimum cover (max new words per step; tie → hasAudio), plus counts & uncoveredWords.
words_in_article_number: 按文件名开头的数字匹配文章（3 / 03 / 003 等价），在指定篇内检测哪些词出现；source 限定官网/公众号。
Writes JSON to stdout. Config path is argv[1].
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

MAX_PER_SOURCE = 3

# Chinese characters (CJK Unified Ideographs + common extension A bit)
CHINESE_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

OFFICIAL_ID_RE = re.compile(r"^(\d{2,4})(?:[_\-.]|$)")
WECHAT_ID_RE = re.compile(r"^(\d+)(?:[_\-.]|$)")


def load_config(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def normalize(s: str) -> str:
    return "".join(s.split())


# Thai month names in sermon/article datelines (order matches calendar)
_THAI_MONTHS: tuple[str, ...] = (
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
)

_REV_THAI_DIGIT_TRANS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def _thai_digit_str_to_int(s: str) -> int:
    return int(s.translate(_REV_THAI_DIGIT_TRANS))


def _to_buddhist_era_year(y: int) -> int:
    """Treat 1900–2199 as Christian era (rare); otherwise assume already BE."""
    if 1900 <= y <= 2199:
        return y + 543
    return y


def extract_official_youtube_date_phrase(raw: str) -> str | None:
    """
    Official articles usually put the dateline at the end, e.g. '3 กรกฎาคม 2564'
    or 'วันที่ 31 สิงหาคม 2542'. Scan from the last lines upward; Arabic or Thai digits.
    Returns phrase for YouTube search: '<day> <month> <BE year>' (Arabic numerals).
    """
    months_pat = "|".join(re.escape(m) for m in _THAI_MONTHS)
    pat = re.compile(
        rf"(?:วันที่\s*)?([\d๐-๙]{{1,2}})\s+({months_pat})\s*(?:พ\.ศ\.?\s*)?([\d๐-๙]{{4}})"
    )
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return None
    tail = lines[-120:] if len(lines) > 120 else lines
    for line in reversed(tail):
        m = pat.search(line)
        if not m:
            continue
        try:
            day = _thai_digit_str_to_int(m.group(1))
            month = m.group(2)
            year_raw = _thai_digit_str_to_int(m.group(3))
        except ValueError:
            continue
        if not 1 <= day <= 31:
            continue
        be_year = _to_buddhist_era_year(year_raw)
        if not 2400 <= be_year <= 2700:
            continue
        return f"{day} {month} {be_year}"
    return None


def has_chinese(s: str) -> bool:
    return CHINESE_RE.search(s) is not None


def split_sentence_candidates(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    lines = re.split(r"[\n\r]+", text)
    out: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        subs = re.split(r"(?<=[。！？!?])\s+", line)
        for s in subs:
            s = s.strip()
            if s:
                out.append(s)
    return out if out else [text]


def collect_text_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    files: list[Path] = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in {".txt", ".md", ".markdown"}:
            files.append(p)
    return sorted(files)


def parse_official_id(name: str) -> str | None:
    m = OFFICIAL_ID_RE.match(name)
    return m.group(1) if m else None


def parse_wechat_id(name: str) -> str | None:
    m = WECHAT_ID_RE.match(name)
    return m.group(1) if m else None


def official_partner_id(oid: str, official_to_wechat: dict[str, str]) -> str | None:
    if not oid.isdigit():
        return official_to_wechat.get(oid)
    for key in (oid.zfill(3), oid, str(int(oid))):
        if key in official_to_wechat:
            return official_to_wechat[key]
    return None


def wechat_has_audio(wechat_id: str, audio_ids: set[str]) -> bool:
    return str(int(wechat_id)) in audio_ids if wechat_id.isdigit() else wechat_id in audio_ids


def source_has_audio(
    *,
    kind: str,
    basename: str,
    official_to_wechat: dict[str, str],
    audio_ids: set[str],
) -> bool:
    if kind == "wechat":
        wid = parse_wechat_id(basename)
        return wechat_has_audio(wid, audio_ids) if wid else False
    oid = parse_official_id(basename)
    if not oid:
        return False
    partner = official_partner_id(oid, official_to_wechat)
    if partner is None:
        return False
    return wechat_has_audio(str(partner), audio_ids)


def find_matches_in_file(
    path: Path,
    norm_word: str,
    *,
    kind: str,
    official_to_wechat: dict[str, str],
    audio_ids: set[str],
) -> dict[str, Any] | None:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    basename = path.stem
    has_audio = source_has_audio(
        kind=kind,
        basename=basename,
        official_to_wechat=official_to_wechat,
        audio_ids=audio_ids,
    )
    hits: list[str] = []
    seen: set[str] = set()

    for cand in split_sentence_candidates(raw):
        if not cand:
            continue
        if norm_word not in normalize(cand):
            continue
        key = normalize(cand)
        if key in seen:
            continue
        seen.add(key)
        hits.append(cand)
        if len(hits) >= MAX_PER_SOURCE:
            break

    if not hits:
        return None

    label = f"{'官网' if kind == 'official' else '公众号'} · {path.name}"
    out: dict[str, Any] = {
        "path": str(path.resolve()),
        "fileName": path.name,
        "sourceLabel": label,
        "kind": kind,
        "hasAudio": has_audio,
        "audioIcon": "🎵" if has_audio else "📺",
        "hasChinese": any(has_chinese(s) for s in hits),
        "sentences": hits,
    }
    if kind == "official":
        dt = extract_official_youtube_date_phrase(raw)
        if dt:
            out["youtubeSearchDatePhrase"] = dt
    return out


def search_word(
    query: str,
    cfg: dict[str, Any],
) -> list[dict[str, Any]]:
    norm_word = normalize(query)
    if not norm_word:
        return []

    official_to_wechat = {str(k): str(v) for k, v in (cfg.get("officialToWechat") or {}).items()}
    audio_ids = {str(int(x)) for x in (cfg.get("wechatAudioIds") or [])}

    dhamma = Path(cfg["dhammaArticlesDir"])
    wechat = Path(cfg["wechatArticlesDir"])

    results: list[dict[str, Any]] = []
    for path in collect_text_files(dhamma):
        m = find_matches_in_file(
            path, norm_word, kind="official", official_to_wechat=official_to_wechat, audio_ids=audio_ids
        )
        if m:
            results.append(m)
    for path in collect_text_files(wechat):
        m = find_matches_in_file(
            path, norm_word, kind="wechat", official_to_wechat=official_to_wechat, audio_ids=audio_ids
        )
        if m:
            results.append(m)

    results.sort(key=lambda r: (not r["hasAudio"], r["sourceLabel"]))
    return results


def batch_status(results: list[dict[str, Any]]) -> str:
    if not results:
        return "not_found"
    if any(r["hasAudio"] for r in results):
        return "has_audio"
    return "youtube"


def unique_ordered_words(words: list[str]) -> list[str]:
    seen_norm: set[str] = set()
    out: list[str] = []
    for w in words:
        if not isinstance(w, str):
            continue
        w = w.strip()
        if not w:
            continue
        nw = normalize(w)
        if not nw or nw in seen_norm:
            continue
        seen_norm.add(nw)
        out.append(w)
    return out


def _article_record_from_map(data: dict[str, Any], ordered: list[str]) -> dict[str, Any]:
    wm: dict[str, list[str]] = data["wordMap"]
    word_entries: list[dict[str, Any]] = []
    for w in ordered:
        if w not in wm:
            continue
        sents = wm[w]
        word_entries.append(
            {
                "word": w,
                "sentences": sents,
                "hasChinese": any(has_chinese(s) for s in sents),
            }
        )
    rec: dict[str, Any] = {
        "path": data["path"],
        "fileName": data["fileName"],
        "sourceLabel": data["sourceLabel"],
        "kind": data["kind"],
        "hasAudio": data["hasAudio"],
        "audioIcon": data["audioIcon"],
        "wordCount": len(word_entries),
        "words": word_entries,
    }
    if data.get("youtubeSearchDatePhrase"):
        rec["youtubeSearchDatePhrase"] = data["youtubeSearchDatePhrase"]
    return rec


def _build_article_map(ordered: list[str], cfg: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_path: dict[str, dict[str, Any]] = {}
    for w in ordered:
        for r in search_word(w, cfg):
            p = r["path"]
            if p not in by_path:
                by_path[p] = {
                    "path": r["path"],
                    "fileName": r["fileName"],
                    "sourceLabel": r["sourceLabel"],
                    "kind": r["kind"],
                    "hasAudio": r["hasAudio"],
                    "audioIcon": r["audioIcon"],
                    "wordMap": {},
                    "youtubeSearchDatePhrase": r.get("youtubeSearchDatePhrase"),
                }
            elif not by_path[p].get("youtubeSearchDatePhrase") and r.get("youtubeSearchDatePhrase"):
                by_path[p]["youtubeSearchDatePhrase"] = r["youtubeSearchDatePhrase"]
            by_path[p]["wordMap"][w] = r["sentences"]
    return by_path


def greedy_cover_plan(
    ordered: list[str], by_path: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Greedy set cover: repeatedly pick the article covering the most still-uncovered words.
    Tie-break: more new covers wins; then prefer hasAudio; then sourceLabel (stable).
    """
    uncovered = set(ordered)
    used: set[str] = set()
    plan: list[dict[str, Any]] = []
    word_sets = {p: set(data["wordMap"].keys()) for p, data in by_path.items()}

    while uncovered:
        best_path: str | None = None
        best_rank: tuple[int, int, str] | None = None
        for p, data in by_path.items():
            if p in used:
                continue
            new_n = len(word_sets[p] & uncovered)
            if new_n == 0:
                continue
            has_audio = bool(data["hasAudio"])
            rank = (new_n, 1 if has_audio else 0, data["sourceLabel"])
            if best_rank is None or rank > best_rank:
                best_rank = rank
                best_path = p
        if best_path is None:
            break
        used.add(best_path)
        data = by_path[best_path]
        rec = _article_record_from_map(data, ordered)
        newly = word_sets[best_path] & uncovered
        rec["newlyCoveredWords"] = [w for w in ordered if w in newly]
        plan.append(rec)
        uncovered -= word_sets[best_path]

    uncovered_list = [w for w in ordered if w in uncovered]
    return plan, uncovered_list


def _normalize_article_source_scope(raw: Any) -> str:
    if raw in ("official", "wechat", "all"):
        return str(raw)
    return "all"


def list_paths_for_article_number(
    article_number: str, cfg: dict[str, Any], source_scope: str = "all"
) -> list[tuple[Path, str]]:
    u = (article_number or "").strip()
    u_digits = re.sub(r"[^\d]", "", u)
    if not u_digits:
        return []
    try:
        target_num = int(u_digits)
    except ValueError:
        return []
    dhamma = Path(cfg["dhammaArticlesDir"])
    wechat = Path(cfg["wechatArticlesDir"])
    out: list[tuple[Path, str]] = []
    for root, kind in ((dhamma, "official"), (wechat, "wechat")):
        if source_scope == "official" and kind != "official":
            continue
        if source_scope == "wechat" and kind != "wechat":
            continue
        if not root.is_dir():
            continue
        for path in collect_text_files(root):
            stem = path.stem
            m = re.match(r"^(\d+)", stem)
            if not m:
                continue
            try:
                if int(m.group(1)) != target_num:
                    continue
            except ValueError:
                continue
            out.append((path, kind))
    out.sort(key=lambda x: (x[1], str(x[0])))
    return out


def file_article_preview(path: Path, kind: str, cfg: dict[str, Any]) -> dict[str, Any]:
    official_to_wechat = {str(k): str(v) for k, v in (cfg.get("officialToWechat") or {}).items()}
    audio_ids = {str(int(x)) for x in (cfg.get("wechatAudioIds") or [])}
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        raw = ""
    basename = path.stem
    has_audio = source_has_audio(
        kind=kind,
        basename=basename,
        official_to_wechat=official_to_wechat,
        audio_ids=audio_ids,
    )
    label = f"{'官网' if kind == 'official' else '公众号'} · {path.name}"
    rec: dict[str, Any] = {
        "path": str(path.resolve()),
        "fileName": path.name,
        "sourceLabel": label,
        "kind": kind,
        "hasAudio": has_audio,
        "audioIcon": "🎵" if has_audio else "📺",
    }
    if kind == "official":
        dt = extract_official_youtube_date_phrase(raw)
        if dt:
            rec["youtubeSearchDatePhrase"] = dt
    return rec


def words_in_article_number(
    article_number: str,
    words: list[str],
    cfg: dict[str, Any],
    source_scope: str = "all",
) -> dict[str, Any]:
    paths_kinds = list_paths_for_article_number(article_number, cfg, source_scope)
    ordered = unique_ordered_words(words)
    scope_hint = {
        "all": "（官网与公众号目录）",
        "official": "（仅限官网目录）",
        "wechat": "（仅限公众号目录）",
    }.get(source_scope, "")
    if not paths_kinds:
        return {
            "error": f"未找到编号为「{article_number}」的文章{scope_hint}（文件名需以该数字开头，如 003_….txt）",
            "articleNumber": re.sub(r"[^\d]", "", (article_number or "").strip()) or (article_number or "").strip(),
            "sourceScope": source_scope,
            "articleFiles": [],
            "hits": [],
            "misses": ordered,
        }
    official_to_wechat = {str(k): str(v) for k, v in (cfg.get("officialToWechat") or {}).items()}
    audio_ids = {str(int(x)) for x in (cfg.get("wechatAudioIds") or [])}

    article_files = [file_article_preview(p, k, cfg) for p, k in paths_kinds]

    hits: list[dict[str, Any]] = []
    misses: list[str] = []
    max_sents = MAX_PER_SOURCE * max(1, len(paths_kinds))
    for w in ordered:
        norm_w = normalize(w)
        if not norm_w:
            continue
        all_sents: list[str] = []
        seen_norm_sent: set[str] = set()
        has_zh = False
        for path, kind in paths_kinds:
            m = find_matches_in_file(
                path,
                norm_w,
                kind=kind,
                official_to_wechat=official_to_wechat,
                audio_ids=audio_ids,
            )
            if m:
                has_zh = has_zh or bool(m.get("hasChinese"))
                for s in m["sentences"]:
                    sn = normalize(s)
                    if sn not in seen_norm_sent:
                        seen_norm_sent.add(sn)
                        all_sents.append(s)
                    if len(all_sents) >= max_sents:
                        break
            if len(all_sents) >= max_sents:
                break
        if all_sents:
            hits.append({"word": w, "sentences": all_sents, "hasChinese": has_zh})
        else:
            misses.append(w)

    u_digits = re.sub(r"[^\d]", "", (article_number or "").strip())
    return {
        "articleNumber": u_digits or (article_number or "").strip(),
        "sourceScope": source_scope,
        "articleFiles": article_files,
        "hits": hits,
        "misses": misses,
    }


def aggregate_by_article(words: list[str], cfg: dict[str, Any]) -> dict[str, Any]:
    ordered = unique_ordered_words(words)
    if not ordered:
        return {
            "articles": [],
            "inputWordCount": 0,
            "totalArticles": 0,
            "withAudioCount": 0,
            "youtubeCount": 0,
            "uncoveredWords": [],
        }

    by_path = _build_article_map(ordered, cfg)
    plan, uncovered_list = greedy_cover_plan(ordered, by_path)

    with_audio = sum(1 for a in plan if a["hasAudio"])
    return {
        "articles": plan,
        "inputWordCount": len(ordered),
        "totalArticles": len(plan),
        "withAudioCount": with_audio,
        "youtubeCount": len(plan) - with_audio,
        "uncoveredWords": uncovered_list,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing config path"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)
    cfg_path = sys.argv[1]
    try:
        cfg = load_config(cfg_path)
    except Exception as e:
        print(json.dumps({"error": f"config: {e}"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"stdin json: {e}"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    mode = payload.get("mode")
    if mode == "single":
        q = (payload.get("query") or "").strip()
        results = search_word(q, cfg)
        out: dict[str, Any] = {"query": q, "results": results}
    elif mode == "batch":
        words = payload.get("words") or []
        if not isinstance(words, list):
            words = []
        items: list[dict[str, Any]] = []
        for w in words:
            if not isinstance(w, str):
                continue
            w = w.strip()
            if not w:
                continue
            results = search_word(w, cfg)
            st = batch_status(results)
            labels = {"has_audio": "已有音频", "youtube": "需找YouTube", "not_found": "未找到"}
            items.append(
                {
                    "word": w,
                    "status": st,
                    "statusLabel": labels[st],
                    "hitCount": sum(len(r["sentences"]) for r in results),
                    "sources": len(results),
                }
            )
        out = {"items": items}
    elif mode == "by_article":
        words = payload.get("words") or []
        if not isinstance(words, list):
            words = []
        cleaned: list[str] = []
        for w in words:
            if isinstance(w, str) and w.strip():
                cleaned.append(w)
        out = aggregate_by_article(cleaned, cfg)
    elif mode == "words_in_article_number":
        article_number = str(payload.get("articleNumber") or "").strip()
        words = payload.get("words") or []
        if not isinstance(words, list):
            words = []
        cleaned = [w for w in words if isinstance(w, str) and w.strip()]
        if not article_number:
            out = {
                "error": "缺少 articleNumber",
                "articleNumber": "",
                "sourceScope": _normalize_article_source_scope(payload.get("source")),
                "articleFiles": [],
                "hits": [],
                "misses": unique_ordered_words(cleaned),
            }
        else:
            scope = _normalize_article_source_scope(payload.get("source"))
            out = words_in_article_number(article_number, cleaned, cfg, scope)
    else:
        print(json.dumps({"error": "invalid mode"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
