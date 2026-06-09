import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { geminiConfigured, streamGeminiTurn, type Content, type FunctionCall } from "@/lib/ai/gemini";
import { toolsForUser, executeTool } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { recentContents, saveMessage } from "@/lib/ai/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 4000;
const MAX_TOOL_ROUNDS = 6; // hard stop so a tool loop can't run forever

// POST /api/ai  { message: string }
// Streams the assistant's answer back as plain UTF-8 text deltas. Internally it
// runs the tool-calling loop: the model may call read-only, permission-gated
// tools; we execute them, feed results back, and stream the final answer.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.isSuperadmin, user.permissions, "ai.use")) {
    return NextResponse.json({ error: "You don't have access to Ask AI." }, { status: 403 });
  }
  if (!geminiConfigured()) {
    return NextResponse.json(
      { error: "Ask AI isn't configured yet. An admin needs to set GEMINI_API_KEY." },
      { status: 503 }
    );
  }

  let message = "";
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) message = message.slice(0, MAX_MESSAGE_CHARS);

  // Persist the user's turn first, then load recent history (which now includes
  // it) as the model context — bounded to the short memory window.
  await saveMessage(user.companyId, user.id, "user", message);
  const contents: Content[] = await recentContents(user.id);
  const tools = toolsForUser(user);
  const system = buildSystemPrompt(user, tools);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let streamedAnything = false;
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const turn = streamGeminiTurn({ system, contents, tools });
          const calls: FunctionCall[] = [];

          // Drain this model turn: stream text deltas, collect any tool calls.
          let next = await turn.next();
          while (!next.done) {
            const ev = next.value;
            if (ev.type === "text") {
              answer += ev.text;
              streamedAnything = true;
              controller.enqueue(encoder.encode(ev.text));
            } else if (ev.type === "functionCall") {
              calls.push(ev.call);
            }
            next = await turn.next();
          }
          // Generator return value = the assembled model Content.
          contents.push(next.value);

          if (calls.length === 0) break; // model produced its final answer

          // Execute each requested tool and feed the results back.
          const responseParts = [];
          for (const call of calls) {
            const response = await executeTool(user, call.name, call.args);
            responseParts.push({ functionResponse: { name: call.name, response } });
          }
          contents.push({ role: "user", parts: responseParts });
        }

        const finalText = answer.trim();
        if (finalText) {
          await saveMessage(user.companyId, user.id, "assistant", finalText);
        } else if (!streamedAnything) {
          const fallback = "Sorry — I couldn't produce an answer for that. Try rephrasing your question.";
          controller.enqueue(encoder.encode(fallback));
          await saveMessage(user.companyId, user.id, "assistant", fallback);
        }
      } catch (e) {
        logger.error("ai", "assistant stream failed", { err: e });
        // If we'd already streamed part of an answer, append the notice; else send it alone.
        const note = streamedAnything
          ? "\n\n⚠️ Something went wrong while answering. Please try again."
          : "⚠️ Something went wrong while answering. Please try again.";
        try {
          controller.enqueue(encoder.encode(note));
        } catch {
          /* controller may already be closing */
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
