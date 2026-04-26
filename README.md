<p align="center">
  <img src="static/logo.svg" alt="German Buddy" width="96" />
</p>

<h1 align="center">German Buddy</h1>

<p align="center">
  Your friendly buddy for everyday German — write, speak, and chat your way to fluency.
</p>

---

A minimal **SvelteKit** app for daily German practice. Real-life prompts, gentle corrections, and a chat partner that roleplays everyday scenes. Recent runs stay **only in your browser** (`localStorage`). The server uses an OpenAI-compatible API (**Groq** by default) for all LLM calls.

## Features

- **Landing page (`/`)** — minimalist hero + waitlist signup for `germanbuddy.ai`.
- **Practice app (`/app`)** — three modes:
  - **Write** — answer a prompt in German; get corrected text, a more natural phrasing, a simple English line, and one short tip.
  - **Speak** — same loop, but dictate your answer (Web Speech API where supported); prompts and corrections read aloud.
  - **Chat** — voice-driven roleplay or tutor session. Pick a **scenario** (bakery, restaurant, doctor, job interview, …), **level** (A1–B2), and **style** (roleplay vs. tutor). Word-level corrections with character-diff highlighting and pronunciation hints.
- **History** — last 10 runs persist in browser `localStorage`.
- **No auth, no database** — single-page experience.

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
| `APP_USERNAME` | **Yes** | HTTP Basic auth username for `/app`, `/dashboard`, `/api/correct`, `/api/converse`. Required to access the practice app. |
| `APP_PASSWORD` | **Yes** | HTTP Basic auth password (paired with `APP_USERNAME`). Required to access the practice app. |

The server calls `POST {LLM_BASE_URL}/chat/completions` with an OpenAI-compatible payload. Set `LLM_BASE_URL` + `LLM_MODEL` to swap to OpenAI or any other compatible provider. Discover Groq model ids with `GET https://api.groq.com/openai/v1/models` or the [Groq models docs](https://console.groq.com/docs/models).

**Public repos:** keep real keys in `.env` only (gitignored). Never commit secrets; leave `.env.example` without real values.

## Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

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

Multi-stage `Dockerfile` (`@sveltejs/adapter-node`): the image runs `node build`, listens on **`HOST=0.0.0.0`** and **`PORT`** (default **3000**), and includes a small HTTP health check.

1. In EasyPanel, create an app from this Git repository and choose **build from Dockerfile**.
2. In the service **Environment** tab, set the same variables as in [Environment variables](#environment-variables) above (at minimum `GROQ_API_KEY` or `LLM_API_KEY`). Do not bake secrets into the image; EasyPanel injects them at runtime.
3. Expose **port 3000** to the internet (or set `PORT` to match the port you publish).
4. If links or cookies misbehave behind your reverse proxy, set **`ORIGIN`** to your public site URL (e.g. `https://germanbuddy.ai`) — see the [SvelteKit adapter-node docs](https://svelte.dev/docs/kit/adapter-node#Environment-variables).

The waitlist endpoint persists signups to `./data/waitlist.jsonl`. Mount a volume at `/app/data` if you want them to survive container restarts.

## Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Landing page — branding + waitlist signup | public |
| `/login` | Username + password sign-in form | public |
| `/logout` | Clears the session cookie, redirects to `/` | public |
| `/app` | Practice app (write / speak / chat) | session |
| `/dashboard` | 302 redirect → `/app` | session |
| `POST /api/correct` | `{ prompt, answer }` → `{ original, corrected, natural, english, tip }` | session |
| `POST /api/converse` | `{ messages, level, scenario, style }` → assistant reply + word-level corrections + pronunciation | session |
| `POST /api/waitlist` | `{ email }` → appends to `data/waitlist.jsonl` and logs (best-effort) | public |

### Auth flow

- `/login` posts `username` + `password` to a SvelteKit **form action** that runs entirely server-side (`src/routes/login/+page.server.ts`). Credentials are compared in **constant time** against `APP_USERNAME` / `APP_PASSWORD` from `$env/dynamic/private` — the env values never reach the browser.
- On success the server sets an **httpOnly, sameSite=lax, secure-in-prod** cookie (`gb_session`) whose value is the HMAC-SHA256 of `${APP_USERNAME}:${APP_PASSWORD}` keyed against a fixed string. The cookie is just a fingerprint — it can't be reversed into the credentials, and rotating either env var instantly invalidates every existing session.
- `src/hooks.server.ts` validates that cookie on every request to a protected route. Failures redirect navigations to `/login?next=…` and return `401 JSON` to API callers.
- `/logout` clears the cookie and bounces back to `/`. There is a small "Sign out" button at the top of `/app`.

Both `APP_USERNAME` and `APP_PASSWORD` are required — if either is empty, the protected routes always block (one-time `console.error` flags the misconfiguration).

## Architecture

- **`src/hooks.server.ts`** — session-cookie gate for `/app`, `/dashboard`, `/api/correct`, `/api/converse`. Redirects unauthenticated navigations to `/login?next=…` and returns `401 JSON` to API callers.
- **`src/lib/server/auth.ts`** — server-only auth helpers: `expectedSessionToken`, `isAuthenticated`, `credsMatch`. Uses `node:crypto` for HMAC + `timingSafeEqual`. Reads env via `$env/dynamic/private`.
- **`src/routes/login/`** — username/password form (`+page.svelte`) + server action (`+page.server.ts`) that validates credentials and sets the `gb_session` cookie.
- **`src/routes/logout/+server.ts`** — clears the session cookie and redirects to `/`.
- **`src/routes/+page.svelte`** — marketing landing page + waitlist form.
- **`src/routes/app/+page.svelte`** — practice app UI: write / speak / chat modes, TTS (`speechSynthesis` for `de-DE` + `en-*`), dictation, feedback cards, history.
- **`src/routes/api/{correct,converse,waitlist}/+server.ts`** — POST endpoints.
- **`src/lib/prompts.ts`** / **`practice-catalog.ts`** — daily-life prompts + numbers/alphabet topics; *New prompt* randomizes within the selected topic.
- **`src/lib/conversation.ts`** — chat types + scenarios (`small-talk`, `bakery`, `restaurant`, `doctor`, `job-interview`, …) and levels (A1–B2).
- **`src/lib/diff-chars.ts`** — character-level diff used to highlight word corrections.
- **`src/lib/german-tts.ts`** / **`speech-recognition.ts`** — German voice selection + per-level rate + dictation control.
- **`src/lib/server/llm/`** — OpenAI-compatible provider boundary; **`factory.ts`** wires env vars.
- **`src/lib/server/correct-german.ts`** / **`converse-german.ts`** — system prompts tuned for learners; JSON-mode when enabled.
- **`src/lib/server/parse-correction.ts`** / **`parse-conversation.ts`** — defensive JSON parsing so the UI never breaks on malformed model output.
- **`src/lib/history.ts`** — `localStorage` read/write for the last **10** entries.
- **`static/logo.svg`** — single-source brand mark; used at favicon, header, hero, and footer.

No external UI kit — **Tailwind CSS v4** via Vite plugin (`src/routes/layout.css`).
