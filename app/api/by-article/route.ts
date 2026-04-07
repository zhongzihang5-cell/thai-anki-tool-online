import { NextResponse } from "next/server";
import { runArticleSearch } from "@/lib/runArticleSearch";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw =
    typeof body === "object" &&
    body !== null &&
    "words" in body &&
    Array.isArray((body as { words: unknown }).words)
      ? (body as { words: unknown[] }).words
      : null;
  if (!raw) {
    return NextResponse.json({ error: "Missing words array" }, { status: 400 });
  }
  const words = raw
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return NextResponse.json({ error: "No words to search" }, { status: 400 });
  }
  try {
    const data = await runArticleSearch({ mode: "by_article", words });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
