# Features & TODOs

ChatGPT-style UI (100% look) + xKiro-powered chat client. Below is the feature
roadmap. ✅ = done, ⬜ = not yet (search the code for `TODO:` markers too).

## ✅ Implemented

### Latest batch (all requested features)
- ✅ **File / PDF upload** — server-side parsing route (`app/api/files`) extracts text from PDF, DOCX, text/code/CSV/JSON; images go to the model as vision input. Limits: 6 files, 8 MB each, 60k chars. ChatGPT-style file chips + inline file cards in messages
- ✅ **Custom instructions (Memory)** — standing instructions in Settings, injected into every conversation's system prompt
- ✅ **Projects** — named workspaces with shared instructions; chats bind to a project and inherit its context
- ✅ **Quick / Thinking modes** — Thinking clamps temperature ≤0.6 and raises the output cap to 8k for more careful answers
- ✅ **Message pin + branch** — pin any message (accent bar) or fork the conversation at that point into a new chat
- ✅ **Token & cost estimate** — provider usage requested via `stream_options.include_usage`; tokens + estimated USD shown per reply
- ✅ **Deep Research mode** — real 3-step pipeline: plan 3–5 queries → parallel web search → synthesised cited Markdown report, with live progress stages
- ✅ **Keyboard navigation** — ↑/↓/Home/End walk the chat list with DOM focus following
- ✅ **PWA** — manifest, SVG app icon, `appleWebApp` metadata, installable to home screen
- ✅ **Profile editing** — custom avatar (auto centre-cropped to 256px square), display name, private real name, optional sync to the sign-in provider
- ✅ **Direct image download** — `/api/image-proxy` streams the file with `Content-Disposition: attachment`, so saving works even when the image CDN sends no CORS headers (SSRF-guarded)
- ✅ **Responsive image generation** — fluid `clamp()` animation, `object-fit` images capped by viewport height, cheaper blur on mobile, `prefers-reduced-motion` support
- ✅ **ChatGPT-style favicon** — knot logo as SVG, wired for browsers, iOS and the PWA manifest

### ChatGPT parity
- ✅ **Message feedback (👍/👎)** — ChatGPT's rating row under every assistant reply; clicking toggles it (click again to clear), persists with the chat, and shows a "Thanks for the feedback!" confirmation
- ✅ **Share link** — the topbar share button (and the per-message share action) copies a link with the whole conversation gzip-compressed into the URL hash (`#c=…`); opening it imports the conversation as a new chat and cleans the hash. No server or database involved.
- ✅ **Scroll-to-latest arrow** — a circular down-arrow button appears above the composer whenever the thread is scrolled up, exactly like ChatGPT
- ✅ **Voice controls** — Settings → Voice now has **Speed** (0.5–2×) and **Pitch** (−10…+10) sliders, forwarded to xKiro `POST /v1/audio/speech` and also applied to the browser-speech fallback
- ✅ **ChatGPT-style settings page** — two-column layout (left section nav: General / Voice / Data controls / Account + right content pane), divider-separated rows with label + description left and control right, and **live-apply** (no Save/Cancel — just ✕ / Esc) exactly like chatgpt.com
- ✅ **Account menu** — the sidebar profile pill now opens a ChatGPT-style popover with **⚙ Settings** and **Sign out** (Settings opens the same dialog as the topbar gear)
- ✅ **Auto-title chats** — the first user message is summarized into a 2-5 word conversation title by the model (`title: true` fast non-streaming call on `POST /v1/chat/completions`), with the `titleFrom` text fallback if it fails; a manual rename made meanwhile always wins
- ✅ **Delete-chat undo toast** — deleting a chat removes it immediately (no `window.confirm`) and shows a "Chat deleted · **Undo**" toast for 6s that restores the chat at its original position, like ChatGPT
- ✅ **Inline rename** — the sidebar row turns into an input (Enter saves, Esc cancels, blur saves) instead of `window.prompt`

### Core chat
- ✅ Streaming answers via server route → xKiro (`https://api.xkiro.com/v1`)
- ✅ Real `XKIRO_API_KEY` + `XKIRO_BASE_URL` in `.env.local`
- ✅ Free-model default (`qwen/qwen3.5-flash:free`) + xKiro model picker
- ✅ Markdown rendering, fenced code blocks with copy button
- ✅ Chat history in `localStorage` (cap 200), regenerate, stop generation
- ✅ Copy individual messages

### ChatGPT look & feel
- ✅ Exact ChatGPT palette (dark `#212121` / light `#ffffff`), 768px chat column
- ✅ Centered model pill, chatgpt-style avatars, no role labels
- ✅ User messages right-aligned, composer send-on-typing + disclaimer
- ✅ **SaaS polish pass** — pure-black dark theme, clean white light theme, glassy modals/overlays, soft focus rings, hover lifts on cards/buttons/bubbles, smooth theme transitions, refined menus/inputs/toggles

### Chat management (new)
- ✅ **Pin chats** — pinned section at the top of the sidebar
- ✅ **Date-grouped history** — Today / Yesterday / Previous 7 days / Older
- ✅ **Search** with result count
- ✅ **Export active chat** as Markdown (download button in the top bar)
- ✅ **Edit & resend** a user message inline (Enter or "Save & send")
- ✅ **Delete a message** (removes it and everything after it)

### Usability (new)
- ✅ **Keyboard-shortcuts help** (`?` or the ? button), incl. new shortcuts
- ✅ **Inline rename in the sidebar** (no more `window.prompt`)

### Power features (new)
- ✅ **Copy full chat** — one-click copy of the whole conversation as Markdown (top-bar copy button)
- ✅ **Web search toggle** — composer search button; the server runs **real xKiro search** (`POST /v1/search`) and injects ranked results with source URLs into the next message; the model cites sources inline
- ✅ **Image attachments** — attach & downscale images client-side; vision-friendly `image_url` content parts sent to the API
- ✅ **Per-chat model memory** — each conversation remembers its model and restores it when reopened
- ✅ **Model on responses** — each assistant reply shows `via <model>` under the content

### Tools (new)
- ✅ **Image generation (ChatGPT-style attach-first)** — click the 🖼 button to arm image mode: a "Generate image · 1:1 ▾" chip attaches above the composer (exactly like ChatGPT), then press **Send** with your prompt and the image is generated inline by `sensenova/sensenova-u1.5-lite` on xKiro (async job + polling)
- ✅ **All image aspect ratios** — the ▾ pill on the attached image-mode chip opens the picker (Square 1:1, Landscape 4:3, Wide 16:9, Portrait 3:4, Tall 9:16, Ultrawide 21:9); the ratio is auto-converted to xKiro pixel sizes (`size`), remembered in Settings, and shows the download button on every generated image
- ✅ **Image download** — dark blur-glass download chip in the corner of each generated image (fetch→blob save, opens in a new tab if the CDN blocks CORS)
- ✅ **100% real ChatGPT bubbles** — user messages are flat, borderless, tail-less rounded rectangles right-aligned (exactly like chatgpt.com's `.user-message-bubble-color`); faint blue-grey fill in both themes, **no gradient, no shadow, no hover-lift**; assistant messages stay plain text with no bubble
- ✅ **Pick-a-color user bubbles** — Settings → swatch picker (Grey/Blue/Green/Purple/Teal/Orange/Rose); flat subtle tints in both themes, remembered across reloads
- ✅ **All tools attach as chips** — web search, built-in tools, and voice input now attach above the composer as ChatGPT-style chips (🕸 Search the web · 🔧 Use tools · 🎤 Voice input) with a ✕ to turn them off
- ✅ **Voice input (mic)** — dictation via the Web Speech API (Chrome/Edge), fills the composer as you speak
- ✅ **Read-aloud / TTS** — Listen button on any assistant reply now uses **xKiro neural TTS** (`POST /v1/audio/speech`, model `xkiro-voice`): 145 premium voices pickable in Settings → Read-aloud voice; auto-falls back to browser speech when the request fails
- ✅ **Model tool calling** — wrench toggle lets the model call server-side tools: current time, date, safe calculator, unit converter; replies show ⚙ chips for tools used
- ✅ **Export & import chats** — full JSON backup/restore from Settings (plus the existing single-chat Markdown export/copy)
- ✅ **Real authentication (Firebase)** — Google/GitHub sign-in via Firebase Auth (`firebase/auth`, signInWithPopup), full-screen login gate, and per-account data isolation (each user's chats/settings live in their own namespace). Runs anonymously with no login when Firebase isn't configured. Setup walkthrough in README.
- ✅ **Per-account storage scoping** — `lib/store.ts` binds every key to the signed-in Firebase uid (`chatgpt2.u.<uid>.*`); sign out → sign in as another user → their own data loads

## ⬜ TODO / roadmap

### High priority
- ✅ **Streaming cancellation** — Stop button now forwards `req.signal` to upstream xKiro fetch; aborting the client stream cancels the provider call (saves tokens/cost)

### Mid priority
- ✅ **Batch web search** — xKiro `POST /v1/search` accepts query arrays (up to 5); client sends `queries` when search is on, server merges results into one context block for the model
- [ ] **TTS polish** — emotion/volume picker for read-aloud (xKiro also supports `volume` and `emotion`); strip trailing "Code block:" phrasing for code-only replies
- [ ] **Image editing** — reuse an attached image as the source for `POST /v1/images/edits`
- [ ] **Token / cost estimate** per message and per conversation

### Low priority / polish
- [x] **Fork / branch a conversation** — branch from any message into a new chat
- [x] **Import JSON** conversations (Markdown import still open)
- [x] **Keyboard navigation** over the chat list
- [x] **PWA/manifest** + install prompt
- [ ] **End-to-end test** for the streaming route (`app/api/chat/route.ts`)
- [ ] **Settings**: system prompt presets, pinned model order, custom free-model list refresh

---
*Generated 2026-09-25. New features added on request, tracked here + via `TODO:` comments.*