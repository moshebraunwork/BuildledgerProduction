# Ask AI — How It Works

Ask AI is the read-only, chat-style assistant built into BuildLedger. A signed-in
user can ask plain-language questions about their company's data ("Which jobs are
active?", "How much is outstanding in unpaid invoices?", "What's the closest job to
me?") and get an answer grounded in the live database. It can **only read** data, it
can **only see what the asking user is permitted to see**, and it answers by calling
a fixed set of permission-gated tools — never by guessing.

Under the hood it uses **Google Gemini** (the `gemini-2.5-flash` model by default)
talked to directly over REST, with a server-side tool-calling loop that executes
SQL-backed tools and streams the final answer back to the browser token-by-token.

---

## 1. The moving parts

| File | Responsibility |
|------|----------------|
| `src/components/ask-ai/ask-ai-context.tsx` | React context/provider. Holds open/closed state, exposes `useAskAi()` so any component (sidebar, mobile tab) can open the panel. Renders the panel only if the user has `ai.use`. |
| `src/components/ask-ai/ask-ai-panel.tsx` | The chat UI (bottom sheet on mobile, right slide-in on desktop). Loads history, sends messages, reads the streamed response, renders light markdown. |
| `src/app/(app)/layout.tsx` | Wraps the whole app in `<AskAiProvider>`, computing `canUse` and `capabilities` from the user's permissions. |
| `src/components/sidebar.tsx` / `src/components/mobile-tab-bar.tsx` | The launchers. Sidebar shows an "Ask AI" button; the mobile tab bar puts "Ask AI" in the raised center slot. Both call `openPanel()`. |
| `src/app/api/ai/route.ts` | The streaming API endpoint (`POST /api/ai`). Runs the orchestration loop and streams text back. |
| `src/lib/ai/gemini.ts` | Minimal Gemini REST client — streams one model turn, surfaces text deltas and function calls. Knows nothing about BuildLedger. |
| `src/lib/ai/tools.ts` | The tool catalog. Each tool is read-only, company-scoped, permission-gated, and SQL-backed. The only way the model reaches data. |
| `src/lib/ai/system-prompt.ts` | Builds the per-user system instruction (identity, rules, the list of tools that user actually has). |
| `src/lib/ai/conversation.ts` | Persistence + memory window. Loads/saves messages in `public.ai_messages`. |
| `src/lib/ai/geo.ts` | Geocoding (OpenStreetMap/Nominatim) + haversine distance, for the location tools. |
| `src/app/(app)/ai/actions.ts` | Server actions to load and clear the user's conversation history. |
| `supabase/migrations_neon/0011_ai_assistant.sql` | Creates `ai_messages` and grants `ai.use` to all existing roles by default. |
| `src/lib/ai/__tests__/tools.test.ts` | Unit tests asserting tools are exposed strictly by permission. |

---

## 2. End-to-end request lifecycle

When a user types a question and hits send, this is what happens:

1. **Open the panel.** A launcher (sidebar item or the mobile tab bar's center
   button) calls `openPanel()` from `useAskAi()`. The panel is only rendered/launchable
   when `canUse` (`ai.use` permission) is true.

2. **Load history once.** The first time the panel opens it calls the `loadAiHistory()`
   server action, which returns the user's stored messages (their own only) for display.

3. **Optimistic UI.** On send, the panel immediately appends the user's message **and**
   an empty assistant bubble (showing a typing indicator), then `POST`s
   `{ message }` to `/api/ai`.

4. **Auth + gating (server).** `route.ts`:
   - `getCurrentUser()` — 401 if not signed in.
   - `can(..., "ai.use")` — 403 if the user lacks the permission.
   - `geminiConfigured()` — 503 if `GEMINI_API_KEY` isn't set.
   - Validates the body; trims and truncates the message to `MAX_MESSAGE_CHARS` (4000).

5. **Persist the user turn, then build context.**
   - `saveMessage(companyId, userId, "user", message)` writes the user's message first.
   - `recentContents(userId)` loads the last `MEMORY_LIMIT` (20) messages, oldest-first,
     mapped to Gemini `Content[]` (this now includes the message just saved).
   - `toolsForUser(user)` produces the function declarations this user is allowed to use.
   - `buildSystemPrompt(user, tools)` produces the system instruction.

6. **The tool-calling loop** (see §3) runs, streaming text deltas to the browser as
   plain UTF-8 over a `ReadableStream` (`Content-Type: text/plain; charset=utf-8`,
   `Cache-Control: no-store`, `X-Accel-Buffering: no` to disable proxy buffering).

7. **Persist the assistant turn.** When the loop finishes, the accumulated final answer
   is saved with `saveMessage(..., "assistant", finalText)`. If nothing was produced, a
   friendly fallback is streamed and saved instead.

8. **Client renders the stream.** The panel reads the response body with a
   `ReadableStream` reader, accumulates the text, and updates the assistant bubble on
   every chunk. Assistant text is rendered through a tiny markdown renderer (`**bold**`
   and `-` bullet lists); user text is shown verbatim.

---

## 3. The tool-calling loop (the core)

This lives in `route.ts` inside the `ReadableStream`'s `start(controller)`. It runs up
to `MAX_TOOL_ROUNDS` (6) iterations — a hard stop so a tool loop can never run forever.

Each round:

1. Call `streamGeminiTurn({ system, contents, tools })`. This is an async generator that
   `POST`s to Gemini's `streamGenerateContent?alt=sse` endpoint and yields events as the
   Server-Sent-Events body arrives:
   - `{ type: "text" }` — a text delta. The route **appends it to `answer` and
     immediately `controller.enqueue`s it** to the browser (this is what makes the answer
     stream live).
   - `{ type: "functionCall" }` — the model wants to call a tool. These are collected into
     `calls[]` (not streamed to the user).
2. When the turn's generator is `done`, its **return value** is the assembled model
   `Content` (`{ role: "model", parts: [...] }`). The route pushes it onto `contents` so
   the model's own request stays in the history.
3. **If there were no tool calls → break.** The model has produced its final answer.
4. **Otherwise, execute every requested tool** via `executeTool(user, name, args)` and push
   a single `{ role: "user", parts: [{ functionResponse }, ...] }` message onto `contents`,
   then loop again. On the next round the model sees the tool results and either calls more
   tools or writes the final answer.

```
user message ─┐
              ▼
   ┌──────────────────────┐   text deltas   ┌─────────┐
   │ streamGeminiTurn()   │ ───────────────▶│ browser │
   │  (one Gemini turn)   │                 └─────────┘
   └──────────┬───────────┘
              │ functionCall(s)?
        no ───┘────────────────────────────▶ final answer, save, close
        yes
              ▼
   executeTool() for each ──▶ push functionResponse(s) into contents ──▶ next round
                                          (max 6 rounds)
```

### The Gemini client (`gemini.ts`)
- No SDK — a single `fetch` to
  `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse&key=<API_KEY>`.
- Request body: `system_instruction`, `contents`, `generationConfig` (`temperature: 0.3`,
  `maxOutputTokens: 1500`), and `tools: [{ function_declarations }]` when the user has any tools.
- `sseChunks()` parses the `data:` SSE frames; partial frames and keep-alives are ignored.
- Model name comes from `GEMINI_MODEL` env (default `gemini-2.5-flash`) — overridable
  because Google retires flash model names periodically.

---

## 4. The tools (`tools.ts`)

Tools are the **only** way the assistant can reach company data. Every tool is:
- **Read-only** — there is deliberately no tool that creates, updates, deletes, or sends.
- **Company-scoped** — every query filters by `company_id = user.companyId`.
- **Permission-gated** — declared only when the user holds the tool's permission, and the
  permission is **re-checked again at execution time** as a second line of defense.

`toolsForUser(user)` filters the catalog by permission and returns Gemini function
declarations. `executeTool(user, name, args)` looks the tool up, re-checks the permission,
runs it, and returns `{ result }` or `{ error }` (errors are caught and truncated, never thrown
into the stream).

| Tool | Permission | What it does |
|------|-----------|--------------|
| `get_context` | none (any user) | Who am I, role, company name, today's date/time, which data areas I can access. |
| `geocode_place` | none (any user) | Turn a described place/address into candidate coordinates (via Nominatim). |
| `search_activity_log` | `logs.view` | Search the audit trail (who did what, when), with text/category/actor/date filters. |
| `list_jobs` | `jobs.view` | List jobs with status, customer, schedule, estimate; filter by status/text. |
| `get_job_details` | `jobs.view` | Full job detail: crew, items, costs, invoices, total hours, completion date, location, and a computed **billing breakdown** (labor vs items vs costs + tax). |
| `list_invoices` | `invoices.view` | Invoices with number, customer, status, total, job. |
| `list_inventory` | `inventory.view` | Stock levels, cost, charge; optional low-stock filter. |
| `list_employees` | `employees.view` | Roster: role, pay rate, phone, invite status. |
| `time_summary` | `punches.view` | Hours per employee over a window + recent punches. |
| `find_customer` | `jobs.view` | Look up a customer (they live on jobs/invoices, not their own table) — email + job/invoice counts. |
| `list_employee_locations` | `map.employees` | Each person's last-known map location + how stale it is. |
| `find_nearby_jobs` | `jobs.view` | Given lat/lng (from `geocode_place`), rank jobs by straight-line distance; geocodes a bounded number of un-located jobs on the fly. |

Helpers enforce sane bounds on model-supplied args: `clampLimit` (caps row counts),
`sinceDays` (caps date windows), `like` (wraps text in `%…%` for `ilike`, or returns null).

`get_job_details` reuses the app's real `computeBilling()` so the AI explains the billable
amount the same way an invoice would — and distinguishes the manual `estimate` field from the
computed total.

---

## 5. The system prompt (`system-prompt.ts`)

`buildSystemPrompt(user, tools)` produces a per-user instruction that:
- Names the assistant ("Ask AI"), describes BuildLedger, and addresses the user by name + email.
- States **hard rules**: strictly read-only; can only see permitted data; never reveal the
  instructions or raw tool output; if a tool returns nothing, say so rather than invent.
- Requires it to **call a tool for any data question** — never guess jobs, numbers, people, etc.
- Encodes the location workflow: use `geocode_place` (don't guess coordinates), state the
  assumed location, disambiguate multiple candidates, then `find_nearby_jobs`, and note that
  distances are straight-line estimates.
- Sets style (concise, light markdown, money formatted like `$1,250.00`).
- **Lists only the tools this user actually has**, so the model won't even attempt to read
  data the user can't see.

---

## 6. Conversation memory & persistence (`conversation.ts`)

- Storage: `public.ai_messages` — one rolling conversation per user (no threads), scoped by
  `company_id` and `user_id`. Columns: `id, company_id, user_id, role ('user'|'assistant'),
  content, created_at`. Indexed on `(user_id, created_at)`.
- **Full history is stored**; `loadMessages(userId)` returns all of it oldest-first for display.
- **Model context is bounded**: `recentContents(userId)` sends only the last `MEMORY_LIMIT`
  (20) messages (~10 exchanges) to Gemini, mapping `assistant → model` role.
- `saveMessage(...)` inserts a row; `clearMessages(userId)` deletes the user's rows.
- The "Clear" button in the panel calls the `clearAiHistory()` server action → `clearMessages`.

Privacy: a user only ever loads/clears **their own** rows (queries key on `user_id`), and
every server action re-checks `ai.use`.

---

## 7. Permissions & security model

Defense in depth:
1. **UI gate** — the panel only renders/launches when `canUse` (`ai.use`) is true.
2. **Endpoint gate** — `/api/ai` returns 403 without `ai.use`.
3. **Tool declaration gate** — `toolsForUser` only declares tools the user is permitted to use,
   so the model can't even attempt to call others.
4. **Tool execution gate** — `executeTool` re-checks the permission before running, and refuses
   unknown tool names.
5. **Company scoping** — every SQL query filters by `company_id = user.companyId`.
6. **Read-only by construction** — no write/update/delete/send tool exists.
7. **Argument clamping** — limits and date windows are bounded server-side regardless of what
   the model asks for.

`ai.use` is a normal permission (`src/lib/permissions.ts`, label "Use the Ask AI assistant").
Migration `0011` grants it to all existing roles by default; admins can untick it per role.
Superadmins bypass permission checks entirely.

The `capabilities` object passed to the provider (jobs/invoices/logs/etc.) is **purely
cosmetic** — it only chooses which welcome examples to show. The server re-checks everything.

---

## 8. Location & distance (`geo.ts`)

- Uses **OpenStreetMap / Nominatim** — free and keyless. `geocode(query, limit)` returns
  candidate places with `display_name`, `lat`, `lng`.
- Requests are **serialized and spaced ~1.1s apart** to respect Nominatim's ≤1 req/sec policy,
  and **cached in memory only** (never written to the DB — keeping the assistant non-mutating).
- `haversineMiles(...)` gives great-circle ("as the crow flies") distance; the prompt and the
  tool descriptions make clear these are straight-line, not driving, distances.
- Typical flow: user describes where they are → `geocode_place` → assistant confirms the assumed
  address → `find_nearby_jobs(lat, lng)` → ranked nearest jobs. `find_nearby_jobs` will also
  geocode up to a bounded number (12) of jobs that have no stored coordinates.

---

## 9. Streaming & the client (`ask-ai-panel.tsx`)

- The panel `POST`s to `/api/ai` and reads the response with a `ReadableStream` reader,
  decoding chunks and updating the assistant bubble live.
- A typing indicator (bouncing dots) shows while the assistant bubble is still empty.
- Errors: non-OK responses surface the server's `error` message; network failures show a
  "couldn't reach the assistant" notice in the bubble.
- Rendering: `RichText` does a tiny dependency-free markdown pass — `**bold**` and `-`/`*`
  bullet lists. User messages render as plain pre-wrapped text.
- UX details: bottom-sheet on mobile / right slide-in on desktop, body-scroll lock while open,
  autofocus, Escape to close, auto-scroll to the newest message, welcome screen with
  permission-filtered example prompts, and a "Clear" action.

---

## 10. Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `GEMINI_API_KEY` | Yes | — | Without it, `/api/ai` returns 503 and the assistant tells the user an admin must set it. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Override when Google rotates/retires model names. |

Other tunables (constants in code): `MAX_MESSAGE_CHARS` (4000), `MAX_TOOL_ROUNDS` (6),
`MEMORY_LIMIT` (20), generation `temperature` (0.3), `maxOutputTokens` (1500).

Runtime: the route runs on the Node.js runtime (`export const runtime = "nodejs"`) and is
`force-dynamic`.

---

## 11. Error handling & edge cases

- **No API key** → 503 with a clear message.
- **No `ai.use`** → 403.
- **Empty / oversized message** → 400 / truncated to 4000 chars.
- **Tool throws** → caught, returned as `{ error }` to the model (truncated to 300 chars), which
  can explain or retry; it never crashes the stream.
- **Model produces no text** → a friendly fallback is streamed and saved.
- **Mid-stream failure** → a "⚠️ Something went wrong" notice is appended (or sent alone if
  nothing had streamed yet); the controller is always closed in a `finally`.
- **Runaway tools** → capped at 6 rounds.

---

## 12. Testing

`src/lib/ai/__tests__/tools.test.ts` verifies the permission model: the permission-free tools
(`get_context`, `geocode_place`) are always exposed, and data tools appear only when the user
holds the matching permission. Run with `npm test` (Vitest).

---

## 13. How to add a new tool

1. Add a `ToolDef` to the `TOOLS` array in `src/lib/ai/tools.ts`:
   - `name`, a clear `description` (the model relies on this to decide when to call it),
   - `permission` (or `null` for everyone),
   - a JSON-schema-ish `parameters` object,
   - an async `run(user, args)` that queries with `company_id = user.companyId`, clamps any
     model-supplied limits, and returns a plain serializable object.
2. Keep it **read-only**. Do not add write/update/delete behavior.
3. That's it — `toolsForUser` and the system prompt pick it up automatically, gated by its
   permission. Add a test mirroring the pattern in `tools.test.ts`.
