# ChatGPT 2.0 — Next.js

A ChatGPT-style AI chat app built with the Next.js App Router. Streaming answers, Markdown
rendering, persistent chat history, model switching, theming, and an offline demo mode that
works with zero configuration.

## Features

- **Streaming responses** via a server route handler (`app/api/chat/route.ts`) using `fetch` + `ReadableStream`. The browser never receives your API key.
- **Server-side key handling** — reads `XKIRO_API_KEY` (or `OPENAI_API_KEY`) from the environment; a key entered in Settings is forwarded as a request header and never persisted server-side.
- **Any OpenAI-compatible backend** — xKiro (default), OpenAI, Groq, Together, OpenRouter, Ollama, vLLM, LM Studio. Change the base URL in Settings.
- **Markdown rendering** — headings, lists, tables, blockquotes, inline code, and fenced code blocks with a language label, a copy button, and light syntax highlighting. Zero Markdown dependencies.
- **Chat history** — conversations are created, titled, renamed, searched, and deleted; all state lives in `localStorage`.
- **Model picker** — GPT-4o, GPT-4o mini, GPT-4.1, o4-mini, or any custom model id.
- **Offline demo mode** — no API key? The built-in demo engine streams canned but context-aware replies so every part of the UI stays testable.
- **Dark / light theme**, responsive layout with a collapsible sidebar, stop-generation, regenerate, and copy.
- **Keyboard shortcuts** — `Enter` send, `Shift+Enter` newline, `Ctrl/Cmd+Shift+O` new chat, `Ctrl/Cmd+Shift+S` settings, `Esc` close menus.
- **Real authentication (optional)** — Firebase Auth sign-in with Google or GitHub. Each account gets its own isolated chats/settings; sign out to switch users. Runs anonymously when Firebase isn't configured.

## Getting started

```bash
npm install
cp .env.example .env.local     # optional — add XKIRO_API_KEY, or skip and use demo mode
npm run dev
```

Open <http://localhost:3000>.

To use a real model, either put the key in `.env.local`:

```
XKIRO_API_KEY=sk-...          # from https://xkiro.com/dashboard/api/keys
XKIRO_BASE_URL=https://api.xkiro.com/v1
```

The default endpoint is xKiro (`https://api.xkiro.com/v1`); 40+ models are free
and the default is `qwen/qwen3.5-flash:free`. Model ids use the `vendor/model`
format from <https://xkiro.com/models>.

…or paste it into **Settings → API key** in the running app (stored only in your browser).

Build for production:

```bash
npm run build
npm start
```

## Real authentication (Firebase — optional)

The app can run behind a real login with **Google** or **GitHub** via Firebase Auth.
When configured, the main screen is gated behind a sign-in card, and every
account's chats, settings, and chosen model are stored under their own
namespace in the browser — sign out and sign in as someone else to switch.

Until you configure it, the app runs **anonymously** (no login gate) exactly as
it does today.

1. Create a project at <https://console.firebase.google.com/> (free tier is plenty).
2. In the project, add a **Web app** (`</>`): you'll get a config with
   `apiKey`, `authDomain`, `projectId`, and `appId`.
3. Open **Build → Authentication → Sign-in method** and enable **Google**.
4. Also enable **GitHub** — it will show an *Authorization callback URL* that
   GitHub requires:
   1. Go to <https://github.com/settings/developers> → **New OAuth App**.
   2. Application name: anything (e.g. `ChatGPT 2.0`).
   3. Homepage URL: `http://localhost:3000`
   4. Authorization callback URL: the one Firebase showed you (looks like
      `https://<project>.firebaseapp.com/__/auth/handler`).
   5. Copy the resulting **Client ID** and **Client secret** into
      Firebase's GitHub provider settings and save.
5. Copy the four config values from step 2 into `.env.local`:

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
   NEXT_PUBLIC_FIREBASE_APP_ID=1:...
   ```

6. Restart the dev server (`npm run dev`). Reload
   <http://localhost:3000> — you'll see the sign-in card.

Notes:

- `NEXT_PUBLIC_*` values are embedded in the browser bundle **by design** —
  Firebase web config is public; security comes from Firebase rules, not secrecy.
- Google/GitHub sign-in runs entirely client-side via `firebase/auth`
  (`signInWithPopup`); tokens are refreshed automatically by the SDK.
- Anonymous mode (no `NEXT_PUBLIC_FIREBASE_*` vars) keeps the old behavior.

## Project structure

```
.
├── app/
│   ├── api/chat/route.ts     # streaming SSE endpoint (proxies the provider)
│   ├── globals.css           # design tokens + all component styles
│   ├── layout.tsx            # metadata, viewport, theme attributes
│   └── page.tsx              # renders <AuthGate /> (login gate + app)
├── components/
│   ├── AuthGate.tsx         # Firebase auth state machine: splash → login → app
│   ├── ChatApp.tsx          # main client component: state, streaming, persistence
│   ├── Composer.tsx         # auto-growing textarea, send / stop
│   ├── Icons.tsx            # inline SVG icons
│   ├── LoginScreen.tsx      # Google / GitHub sign-in card
│   ├── MessageRow.tsx       # one message, Markdown, copy / regenerate
│   ├── SettingsModal.tsx    # API key, base URL, model, temperature, voice, account
│   └── Sidebar.tsx          # conversation list, search, rename, delete
├── lib/
│   ├── demo.ts              # offline canned response engine
│   ├── firebase.ts          # lazy Firebase Auth bootstrap (env-config aware)
│   ├── markdown.ts          # dependency-free Markdown → HTML renderer
│   ├── speech.ts            # read-aloud: xKiro neural TTS + browser fallback
│   ├── store.ts             # per-account localStorage load / save helpers
│   └── types.ts             # shared types, model list, defaults
├── .env.example
└── package.json
```

## How streaming works

1. The client POSTs the message history to `/api/chat`.
2. The route handler calls `<baseUrl>/chat/completions` with `stream: true` and pipes the upstream SSE body straight back to the browser.
3. The client splits the stream on `\n\n`, parses each `data:` frame, and appends `choices[0].delta.content` (or `delta` in demo mode) to the last assistant message.

Because the request goes through your own server route, the key can stay server-side and CORS is never an issue.

## Notes

- Conversations are capped at 200 in `localStorage`; adjust in `lib/store.ts`.
- The demo engine is keyword-routed (`lib/demo.ts`) — it is a UI fallback, not a language model.
- Never commit `.env.local`.

## License

MIT — do what you like.
# chatgpt
