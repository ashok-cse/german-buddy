<p align="center">
  <img src="static/logo.svg" alt="German Buddy" width="96" />
</p>

<h1 align="center">German Buddy</h1>

<p align="center">
  Your friendly buddy for everyday German — write, speak, chat, and build vocabulary.
</p>

---

A minimal **SvelteKit** app for daily German practice. Real-life prompts, gentle corrections, and a chat partner that roleplays everyday scenes. Recent runs stay **only in your browser** (`localStorage`). The server uses an OpenAI-compatible API (**Groq** by default) for all LLM calls.

Sign-in is **Google OAuth** (Auth.js). User profiles and **7-day free trials** are stored in **[PocketBase](https://pocketbase.io)** (`peoples` collection). After the trial window, `/app` and the LLM APIs are blocked until you add billing or extend access in data.

## Features

- **Landing page (`/`)** — minimalist hero + waitlist signup for `germanbuddy.ai`.
- **Practice app (`/app`)** — main areas:
  - **Write** — answer a prompt in German; get corrected text, a more natural phrasing, a simple English line, and one short tip.
  - **Speak** — same loop, but dictate your answer (Web Speech API where supported); prompts and corrections read aloud.
  - **Conversation** — voice session that feels like a **phone call** (no long chat history; one “Buddy / You” turn at a time). Pick **scenario**, **level** (A1–B2), and **style**:
    - **Roleplay** — AI speaks German in character; you reply in German; Piper TTS when configured.
    - **Tutor** — short English cue first, then German to repeat (same audio order). **Tutor drill**: **Phrases** (short German lines) or **Word play** (single words / tiny chunks — numbers, weekdays, daily vocab). Word play tracks distinct targets per browser (**saved vocabulary bank**, goal 300+ words over time) and sends them to the model so it avoids repeats.
  - **Speech-to-text** — when **`GROQ_API_KEY`** is set (or your chat LLM already uses Groq), Conversation prefers **Groq Whisper** (`whisper-large-v3`, German) via `POST /api/transcribe`; otherwise **Web Speech** (Chrome/Edge). Half-duplex flow: mic listens while you speak; speaker plays tutor/roleplay audio without chaining bogus “resume mic” loops.
  - Corrections in tutor mode: word-level diff highlighting, pronunciation hints, teacher feedback panel.
  - **WortWelle** (`/app/wortwelle`) — swipe deck for **~4,000 vocabulary entries** aligned to a **90-day plan** (pick day 1–90). Each card shows German + IPA; **Listen** uses **`/api/tts`** (Piper) when configured; reveal English meaning and use case on demand. Data lives in **`src/lib/data/vocab-german-4000.json`** (generated from the workbook’s `German_4000` sheet). The server returns **only that day’s cards**, not the full list.
- **History** — last 10 runs persist in browser `localStorage`.
- **Google sign-in** — Auth.js session; first sign-in creates a `peoples` row in PocketBase with trial dates.
- **Trial gate** — active trial (`today` ≤ `trial_ends` in PocketBase) required for `/app` and practice APIs; expired trial redirects to `/trial-expired`.

## Install

```bash
npm install
```

## Environment variables

Copy the example file and fill in values:

```bash
cp .env.example .env
```

### LLM

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` or `LLM_API_KEY` | **Yes** | Bearer token (Groq console key; either env name works) |
| `LLM_BASE_URL` | No | API root (default: `https://api.groq.com/openai/v1`) |
| `LLM_MODEL` | No | Model id (default: `llama-3.3-70b-versatile`; try `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, …) |
| `LLM_JSON_OBJECT` | No | `true` / `false` — request JSON-object mode (default: `true`) |

The server calls `POST {LLM_BASE_URL}/chat/completions` with an OpenAI-compatible payload. Set `LLM_BASE_URL` + `LLM_MODEL` to swap to OpenAI or any other compatible provider. Discover Groq model ids with `GET https://api.groq.com/openai/v1/models` or the [Groq models docs](https://console.groq.com/docs/models).

**Speech transcription (Conversation):** the same Groq key is used for `POST https://api.groq.com/openai/v1/audio/transcriptions` (Whisper). If you use **OpenAI only** for chat, set **`GROQ_API_KEY`** separately for STT, or rely on the browser Web Speech API.

### Auth (Google OAuth + Auth.js)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | **Yes** | Random string, **32+ characters** (e.g. `openssl rand -base64 32`) |
| `PUBLIC_GOOGLE_CLIENT_ID` | **Yes** | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | **Yes** | Google OAuth client secret |
| `AUTH_TRUST_HOST` | No | Set `true` behind some proxies (Netlify, Cloudflare, etc.) if sign-in URLs fail |

In Google Cloud Console → APIs & Services → Credentials, add an OAuth client and set **Authorized redirect URIs** to:

- Dev: `http://localhost:5173/auth/callback/google`
- Prod: `https://your-domain/auth/callback/google`

### PocketBase (trial + profile sync)

Server-side admin API only — used on Google sign-in to upsert the `peoples` collection and on each request to enforce the trial for `/app` and practice APIs.

| Variable | Required | Description |
|----------|----------|-------------|
| `POCKETBASE_URL` | **Yes** (for trial gate in prod) | Base URL, **no trailing slash** |
| `POCKETBASE_ADMIN_EMAIL` | **Yes** | PocketBase superuser email |
| `POCKETBASE_ADMIN_PASSWORD` | **Yes** | Superuser password |

If these are unset locally, the app **skips** the PocketBase trial check (useful for dev without a server). In production, set all three so trials and gating work.

**`peoples` fields (Base collection):** `name`, `email`, `trial_starts`, `trial_ends` (dates), `free_trial_used` (bool). New users get 7 days from signup; after `trial_ends`, `free_trial_used` is set on sync and `/app` is gated.

### Other

| Variable | Required | Description |
|----------|----------|-------------|
| `WAITLIST_FILE` | No | Path to the JSONL waitlist log. Default: `./data/waitlist.jsonl` locally, `/app/data/waitlist.jsonl` in Docker. |
| `PIPER_TTS_URL` | No | Optional Piper HTTP server for `/api/tts` (German TTS in Conversation / Speak). |

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

## WortWelle vocab data

The deck reads **`src/lib/data/vocab-german-4000.json`**. To regenerate it after you change the source spreadsheet:

```bash
pip install openpyxl   # or use a venv
python3 scripts/export_german_vocab.py /path/to/german_4000_90_day_sheet_pronunciation.xlsx
```

The script expects a sheet named **`German_4000`** with columns such as **Day**, **German entry**, **Pronunciation (IPA)**, **English meaning**, and **Use case**.

## Deploy (Docker / EasyPanel)

Multi-stage `Dockerfile` (`@sveltejs/adapter-node`): the image runs `node build`, listens on **`HOST=0.0.0.0`** and **`PORT`** (default **3000**), and includes a small HTTP health check.

1. In EasyPanel, create an app from this Git repository and choose **build from Dockerfile**.
2. In the service **Environment** tab, set LLM keys, **Auth.js** vars (`AUTH_SECRET`, `PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), **PocketBase** admin URL + credentials, and any optional vars. Do not bake secrets into the image; inject them at runtime.
3. Expose **port 3000** to the internet (or set `PORT` to match the port you publish).
4. If links or cookies misbehave behind your reverse proxy, set **`ORIGIN`** to your public site URL (e.g. `https://germanbuddy.ai`) — see the [SvelteKit adapter-node docs](https://svelte.dev/docs/kit/adapter-node#Environment-variables).

### Persisting waitlist signups

The image creates an empty `/app/data/waitlist.jsonl` (writable by the non-root runtime user) and declares `/app/data` as a Docker `VOLUME`. Without a mount, every container redeploy in EasyPanel **wipes the file**.

To keep signups, in EasyPanel → your app → **Mounts** tab:

- Mount type: **Volume** (or **Bind**)
- Container path: `/app/data`
- Name / host path: anything you like (e.g. `germanbuddy-waitlist`)

After deploying, the file will be available at `/app/data/waitlist.jsonl` inside the container — view or replace it from the EasyPanel **Files** tab. The path is also configurable via the `WAITLIST_FILE` env var if you'd rather mount the volume somewhere else.

## Routes

| Route | Purpose | Access |
|-------|---------|--------|
| `/` | Landing — branding + waitlist signup | public |
| `/login` | Google sign-in | public |
| `/logout` | Clears Auth.js session, redirects | public |
| `/auth/*` | Auth.js OAuth callbacks | public |
| `/app`, `/app/*` | Practice app (write / speak / conversation / **wortwelle**) | Google session + **active trial** |
| `/app/wortwelle` | **WortWelle** — 90-day vocab swipe deck (`?day=1` … `90`) | session + trial |
| `/dashboard` | Redirect → `/app/write` | session + trial |
| `POST /api/correct` | `{ prompt, answer }` → corrections JSON | session + trial |
| `POST /api/converse` | Conversation LLM (`style`, optional `tutorDrill`, optional `avoidGermanTargets` for word play) | session + trial |
| `GET /api/transcribe` | `{ available: boolean }` — Groq key configured for Whisper | session + trial |
| `POST /api/transcribe` | Groq Whisper (`multipart` field `audio`, optional `language`) | session + trial |
| `POST /api/tts` | Piper WAV (if `PIPER_TTS_URL` set) | session + trial |
| `POST /api/waitlist` | `{ email }` → JSONL log | public |

### Auth and trial

- **Auth.js** (`src/auth.ts`) handles Google OAuth; **redirect URI** must match your origin (`/auth/callback/google`).
- On successful sign-in, **`events.signIn`** syncs the user into PocketBase **`peoples`** (create with 7-day `trial_starts` / `trial_ends`, or update name / mark `free_trial_used` when past `trial_ends`).
- **`src/hooks.server.ts`** requires a session for protected routes, then runs **`checkTrialAccessForUser`** for `/app` and the practice APIs. If the trial has ended: navigations go to **`/trial-expired`**; APIs return **403** with `{ "message": "Trial expired" }`.
- If PocketBase is misconfigured or unreachable, the trial check **allows access** and logs an error (availability over strict lockout). Omit PocketBase env in local dev to skip the gate entirely.

## Architecture

- **`src/auth.ts`** — `SvelteKitAuth` + Google provider; PocketBase peoples sync in **`events.signIn`**.
- **`src/hooks.server.ts`** — Auth.js handle + session gate + trial gate (`$lib/server/trial-access`).
- **`src/lib/server/auth.ts`** — `authConfigured()` (checks `AUTH_SECRET`, Google client id/secret).
- **`src/lib/server/pocketbase/`** — Admin PocketBase client (`getPocketBaseAdmin`), **`peoples`** CRUD + **`ensurePeoplesForOAuthUser`**, **`isTrialActive`**.
- **`src/lib/server/trial-access.ts`** — **`checkTrialAccessForUser`**, **`requiresTrialGate`**.
- **`src/routes/login/`** — Google button via `@auth/sveltekit/client` **`signIn`**.
- **`src/routes/trial-expired/`** — Trial-ended screen; load redirects to `/app` if trial is still active.
- **`src/routes/app/+layout.svelte`** — App chrome + **sign out** + practice tabs.
- **`src/routes/app/wortwelle/`** — **`+page.server.ts`** filters vocab JSON by `?day=`; **`+page.svelte`** swipe UI + TTS.
- **`src/lib/vocab-deck.ts`** — vocab types + shuffle helper.
- **`src/lib/data/vocab-german-4000.json`** — exported 4k-row deck (see **WortWelle vocab data**).
- **`scripts/export_german_vocab.py`** — Excel → JSON export for that deck.
- **`src/routes/api/{correct,converse,tts,waitlist}/+server.ts`** — POST endpoints.
- **`src/lib/prompts.ts`** / **`practice-catalog.ts`** — prompts and topics.
- **`src/lib/conversation.ts`** — scenarios, levels (A1–B2), tutor drill modes (`phrases` / `words`).
- **`src/lib/word-play.ts`** — normalized vocabulary keys, localStorage bank for word play, helpers shared with the server.
- **`src/lib/groq-dictation.ts`** — Groq path: mic + VAD segments → `/api/transcribe`.
- **`src/lib/speech-recognition.ts`** — Web Speech dictation fallback.
- **`src/lib/server/groq-speech.ts`** — resolves Groq API key for Whisper-only endpoints.
- **`src/lib/server/llm/`** — OpenAI-compatible provider; **`factory.ts`** wires env.
- **`src/lib/server/correct-german.ts`** / **`converse-german.ts`** — LLM prompts and parsing (including word-play avoid list).

No external UI kit — **Tailwind CSS v4** via Vite plugin (`src/routes/layout.css`).
