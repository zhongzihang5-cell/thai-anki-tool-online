import { NextResponse } from "next/server";
import { runArticleSearch } from "@/lib/runArticleSearch";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query =
    typeof body === "object" &&
    body !== null &&
    "query" in body &&
    typeof (body as { query: unknown }).query === "string"
      ? (body as { query: string }).query.trim()
      : "";
  if (!query) {
    return NextResponse.json({ error: "Missing or empty query" }, { status: 400 });
  }
  try {
    const data = await runArticleSearch({ mode: "single", query });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
