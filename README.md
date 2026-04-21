# German Buddy

A minimal **SvelteKit** app for day-one German practice: answer a real-life prompt in German (type or dictate), hear the prompt read aloud if you like, then get structured feedback — corrected text, a more natural phrasing, a simple English line, and one short tip. Recent runs stay **only in your browser** (`localStorage`). The server uses an OpenAI-compatible API (**Groq** by default) for corrections.

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

**Public repos:** keep real keys in `.env` only (gitignored). Never commit secrets; leave `.env.example` without real values.

## Run locally

```bash
npm run dev
```

Then open the URL shown in the terminal (usually `http://localhost:5173`).

Production build (Node adapter):

```bash
npm run build
node build
```

Local preview of the production bundle (optional):

```bash
npm run preview
```

## Deploy (Docker / EasyPanel)

The repo includes a **multi-stage `Dockerfile`** (`@sveltejs/adapter-node`): the image runs `node build`, listens on **`HOST=0.0.0.0`** and **`PORT`** (default **3000**), and includes a small HTTP health check.

1. In EasyPanel, create an app from this Git repository and choose **build from Dockerfile** (Dockerfile at the repo root).
2. In the service **Environment** tab, set the same variables as in [Environment variables](#environment-variables) above (at minimum `GROQ_API_KEY` or `LLM_API_KEY`). Do not bake secrets into the image; EasyPanel injects them at runtime.
3. Expose **port 3000** to the internet (or set `PORT` in the panel to match the port you publish).
4. If links or cookies misbehave behind your reverse proxy, set **`ORIGIN`** to your public site URL (for example `https://your-domain.com`) as described in the [SvelteKit adapter-node docs](https://svelte.dev/docs/kit/adapter-node#Environment-variables).

## Architecture (brief)

- **`src/routes/+page.svelte`** — Single-page UI: writing / speaking modes, prompt TTS (`speechSynthesis`, `de-DE`), dictation where supported, textarea, feedback cards, history, copy + **Read aloud** on corrections.
- **`src/lib/prompts.ts`** / **`src/lib/practice-catalog.ts`** — Daily-life prompts plus numbers/alphabet topics; “New prompt” randomizes within the selected topic.
- **`src/routes/api/correct/+server.ts`** — `POST` JSON `{ prompt, answer }` → returns `{ original, corrected, natural, english, tip }`.
- **`src/lib/server/llm/`** — Small **provider boundary**: `LlmProvider` + OpenAI-compatible HTTP client; **`src/lib/server/llm/factory.ts`** wires env vars so you can swap implementations in one place.
- **`src/lib/server/correct-german.ts`** — System instructions tuned for learners + calls the provider with JSON mode when enabled.
- **`src/lib/server/parse-correction.ts`** — Strips accidental code fences, parses JSON, fills missing fields from the user text so the UI never breaks on malformed model output.
- **`src/lib/history.ts`** — `localStorage` read/write for the last **10** entries (`prompt`, `original`, `corrected`, `timestamp`).

No auth, no database, no external UI kit — **Tailwind CSS v4** via Vite plugin (`src/routes/layout.css`).
