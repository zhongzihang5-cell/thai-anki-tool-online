#!/usr/bin/env python3
"""
Read Excel word list + Anki collection (SQLite), merge status.
Stdin JSON: { "excelPath", "ankiDbPath", "sheetName"? }
sheetName defaults to 150篇集合; paths default from argv[1] JSON file if keys missing.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    from openpyxl import load_workbook
except ImportError:
    print(
        json.dumps({"error": "需要安装 openpyxl: pip install -r scripts/requirements-words.txt"}),
        file=sys.stderr,
    )
    sys.exit(2)


def load_defaults(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return {}


def parse_bool(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("true", "1", "yes", "y", "是")


def strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "\n", s)


def thai_key(s: str) -> str:
    """Match key: strip + collapse internal whitespace."""
    t = strip_html(str(s or ""))
    return "".join(t.split())


def count_examples_from_flds(flds: str) -> int:
    parts = flds.split("\x1f")
    if len(parts) <= 1:
        return 0
    blob = "\n".join(parts[1:])
    text = strip_html(blob)
    segs = [c.strip() for c in re.split(r"[\n\r]+", text) if c.strip()]
    if segs:
        return len(segs)
    plain = re.sub(r"\s+", "", blob)
    return 1 if plain else 0


def load_anki_map(db_path: str) -> dict[str, int]:
    """thai_key -> max example count among notes. Copy DB to temp file first to avoid locks."""
    p = Path(db_path)
    if not p.is_file():
        return {}
    tmp = tempfile.NamedTemporaryFile(suffix=".anki2", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        shutil.copy2(p, tmp_path)
        conn = sqlite3.connect(tmp_path)
    except (OSError, sqlite3.Error):
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return {}
    try:
        cur = conn.execute("SELECT flds FROM notes")
        out: dict[str, int] = {}
        for (flds,) in cur:
            if not flds:
                continue
            parts = flds.split("\x1f")
            wkey = thai_key(parts[0] if parts else "")
            if not wkey:
                continue
            n = count_examples_from_flds(flds)
            if wkey not in out or n > out[wkey]:
                out[wkey] = n
        return out
    finally:
        conn.close()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def required_examples(need2: bool, need3: bool) -> int:
    if need3:
        return 3
    if need2:
        return 2
    return 0


def compute_status(
    *,
    need_entry: bool,
    need2: bool,
    need3: bool,
    deletable: bool,
    in_anki: bool,
    anki_count: int,
) -> tuple[str, str]:
    """Returns (statusId, statusLabel)."""
    req = required_examples(need2, need3)

    if deletable:
        return "deletable", "可删除"

    if not in_anki:
        if need_entry:
            return "pending", "待录入"
        return "idle", "无需录入"

    if req > 0 and anki_count < req:
        return "supplement", "需补充例句"

    return "done", "已完成"


def main() -> None:
    cfg_file = sys.argv[1] if len(sys.argv) > 1 else None
    defaults = load_defaults(cfg_file)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"stdin json: {e}"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    excel_path = payload.get("excelPath") or defaults.get("excelPath")
    anki_path = payload.get("ankiDbPath") or defaults.get("ankiDbPath")
    sheet_name = payload.get("sheetName") or defaults.get("sheetName") or "150篇集合"

    if not excel_path:
        print(json.dumps({"error": "缺少 excelPath"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)

    xp = Path(excel_path)
    if not xp.is_file():
        print(
            json.dumps({"error": f"Excel 文件不存在: {excel_path}"}, ensure_ascii=False),
            file=sys.stderr,
        )
        sys.exit(2)

    anki_map = load_anki_map(anki_path) if anki_path else {}

    wb = load_workbook(xp, read_only=True, data_only=True)
    if sheet_name not in wb.sheetnames:
        print(
            json.dumps(
                {"error": f"找不到工作表「{sheet_name}」，现有: {wb.sheetnames}"},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(2)
    ws = wb[sheet_name]

    words: list[dict[str, Any]] = []
    stats = {"pending": 0, "supplement": 0, "deletable": 0, "done": 0}

    for row in ws.iter_rows(min_row=2, max_col=8, values_only=True):
        if not row or row[0] is None:
            continue
        thai = str(row[0]).strip()
        if not thai or thai.lower() == "泰文":
            continue

        ipa = "" if row[1] is None else str(row[1]).strip()
        zh = "" if row[2] is None else str(row[2]).strip()
        freq_raw = row[3]
        try:
            freq = int(float(freq_raw)) if freq_raw is not None and str(freq_raw).strip() != "" else 0
        except (TypeError, ValueError):
            freq = 0

        need_entry = parse_bool(row[4]) if len(row) > 4 else False
        need2 = parse_bool(row[5]) if len(row) > 5 else False
        need3 = parse_bool(row[6]) if len(row) > 6 else False
        deletable = parse_bool(row[7]) if len(row) > 7 else False

        key = thai_key(thai)
        in_anki = key in anki_map
        anki_count = anki_map.get(key, 0)
        req = required_examples(need2, need3)

        sid, label = compute_status(
            need_entry=need_entry,
            need2=need2,
            need3=need3,
            deletable=deletable,
            in_anki=in_anki,
            anki_count=anki_count,
        )

        if sid == "pending":
            stats["pending"] += 1
        elif sid == "supplement":
            stats["supplement"] += 1
        elif sid == "deletable":
            stats["deletable"] += 1
        elif sid == "done":
            stats["done"] += 1

        need_label = "—"
        if req == 3:
            need_label = "3"
        elif req == 2:
            need_label = "2"

        words.append(
            {
                "thai": thai,
                "ipa": ipa,
                "chinese": zh,
                "frequency": freq,
                "needEntry": need_entry,
                "need2": need2,
                "need3": need3,
                "deletable": deletable,
                "requiredExamples": req,
                "requiredLabel": need_label,
                "inAnki": in_anki,
                "ankiExampleCount": anki_count,
                "status": sid,
                "statusLabel": label,
            }
        )

    wb.close()

    print(json.dumps({"stats": stats, "words": words}, ensure_ascii=False))


if __name__ == "__main__":
    main()
