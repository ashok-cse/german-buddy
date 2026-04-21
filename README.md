# German Mirror

A minimal **SvelteKit** app for day-one German practice: you answer one real-life prompt in German, then get instant structured feedback (corrected text, a more natural version, simple English, and one short tip). Recent runs are saved **only in the browser** (`localStorage`).

## Install

```bash
npm install
```

## Environment variables

Copy the example file and fill in your key:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` or `LLM_API_KEY` | **Yes** | Bearer token (Groq console key; either env name works) |
| `LLM_BASE_URL` | No | API root (default: `https://api.groq.com/openai/v1`) |
| `LLM_MODEL` | No | Model id (default: `llama-3.3-70b-versatile`; try `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, …) |
| `LLM_JSON_OBJECT` | No | `true` / `false` — request JSON-object mode (default: `true`) |

The server calls `POST {LLM_BASE_URL}/chat/completions` with an OpenAI-compatible payload. **Groq** is the default host; set `LLM_BASE_URL` + `LLM_MODEL` to use OpenAI or another compatible API. Discover Groq model ids with `GET https://api.groq.com/openai/v1/models` or the [Groq models docs](https://console.groq.com/docs/models).

## Run locally

```bash
npm run dev
```

Then open the URL shown in the terminal (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Architecture (brief)

- **`src/routes/+page.svelte`** — Single-page UI: prompt, textarea, loading/error/empty states, feedback cards, history, copy + optional **Read aloud** (`speechSynthesis`, `de-DE`).
- **`src/lib/prompts.ts`** — Fifteen fixed practice prompts; random on load; “New prompt” picks a different one.
- **`src/routes/api/correct/+server.ts`** — `POST` JSON `{ prompt, answer }` → returns `{ original, corrected, natural, english, tip }`.
- **`src/lib/server/llm/`** — Small **provider boundary**: `LlmProvider` + OpenAI-compatible HTTP client; **`src/lib/server/llm/factory.ts`** wires env vars so you can swap implementations in one place.
- **`src/lib/server/correct-german.ts`** — System instructions tuned for learners + calls the provider with JSON mode when enabled.
- **`src/lib/server/parse-correction.ts`** — Strips accidental code fences, parses JSON, fills missing fields from the user text so the UI never breaks on malformed model output.
- **`src/lib/history.ts`** — `localStorage` read/write for the last **10** entries (`prompt`, `original`, `corrected`, `timestamp`).

No auth, no database, no external UI kit — **Tailwind CSS v4** via Vite plugin (`src/routes/layout.css`).
# german-buddy
