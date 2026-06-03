// ============================================================================
// Minimal Google Gemini REST client — streaming + function calling, no SDK.
//
// We talk to the generativelanguage v1beta endpoint directly with fetch (same
// "keep dependencies minimal" approach as the Clerk webhook). This file knows
// nothing about BuildLedger's tools or data; it just streams one model turn and
// surfaces text deltas and function calls. The orchestration loop (executing
// tools and feeding results back) lives in the API route.
// ============================================================================

export type Part =
  | { text: string }
  | { functionCall: FunctionCall }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "functionCall"; call: FunctionCall };

export function geminiModel(): string {
  // Override with GEMINI_MODEL when Google rotates model names (older flash
  // models get retired periodically and start returning 404).
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Parses an `alt=sse` response body into successive JSON chunks.
async function* sseChunks(res: Response): AsyncGenerator<any> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    // SSE frames are newline-delimited `data: { ... }` lines.
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        yield JSON.parse(payload);
      } catch {
        /* ignore keep-alives / partial frames */
      }
    }
  }
}

// Streams a single model turn. Yields text deltas and function calls as they
// arrive, and returns the assembled model Content (to append to the history
// before sending tool results back).
export async function* streamGeminiTurn(opts: {
  system: string;
  contents: Content[];
  tools: FunctionDeclaration[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent, Content> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = geminiModel();

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
  };
  if (opts.tools.length) {
    body.tools = [{ function_declarations: opts.tools }];
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const parts: Part[] = [];
  for await (const chunk of sseChunks(res)) {
    const cparts: any[] = chunk?.candidates?.[0]?.content?.parts ?? [];
    for (const p of cparts) {
      if (typeof p.text === "string" && p.text.length) {
        parts.push({ text: p.text });
        yield { type: "text", text: p.text };
      } else if (p.functionCall) {
        const call: FunctionCall = {
          name: p.functionCall.name,
          args: (p.functionCall.args ?? {}) as Record<string, unknown>,
        };
        parts.push({ functionCall: call });
        yield { type: "functionCall", call };
      }
    }
  }

  return { role: "model", parts };
}
