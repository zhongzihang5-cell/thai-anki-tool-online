import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "服务器未配置 ANTHROPIC_API_KEY，无法生成音标" },
      { status: 503 }
    );
  }
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "缺少 text" }, { status: 400 });
  }
  const model =
    process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Output ONLY Paiboon-style romanization with tone marks for this Thai text. No Thai script, no quotes, no explanation, one line.\n\n${text}`,
          },
        ],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Claude API ${res.status}`, detail: raw.slice(0, 800) },
        { status: 502 }
      );
    }
    const data = JSON.parse(raw) as {
      content?: { type: string; text?: string }[];
    };
    const block = data.content?.find((c) => c.type === "text");
    const phonetic = (block?.text || "").trim();
    return NextResponse.json({ phonetic });
  } catch (e) {
    const message = e instanceof Error ? e.message : "请求失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
