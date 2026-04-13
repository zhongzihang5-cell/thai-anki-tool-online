import { NextResponse } from "next/server";
import {
  runArticleSearch,
  type WordsInArticleNumberSourceScope,
} from "@/lib/runArticleSearch";

function parseSource(raw: unknown): WordsInArticleNumberSourceScope {
  if (raw === "official" || raw === "wechat" || raw === "all") {
    return raw;
  }
  return "all";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as { articleNumber?: unknown; words?: unknown; source?: unknown };
  const articleNumber =
    typeof b.articleNumber === "string" ? b.articleNumber.trim() : "";
  if (!articleNumber) {
    return NextResponse.json({ error: "Missing articleNumber" }, { status: 400 });
  }
  const raw = Array.isArray(b.words) ? b.words : [];
  const words = raw
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.trim())
    .filter(Boolean);
  const source = parseSource(b.source);

  try {
    const data = await runArticleSearch({
      mode: "words_in_article_number",
      articleNumber,
      words,
      source,
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
