# FreeLLMAPI

Integration with [freellmapi](https://github.com/tashfeenahmed/freellmapi) — a
self-hosted, OpenAI-compatible router that aggregates free tiers from 34
providers behind one `/v1` endpoint.

## What works, and what does not

Checked against the project's own API surface. The match is good but not complete:

| This app calls | FreeLLMAPI serves | |
|---|---|---|
| `/chat/completions` | `/v1/chat/completions` | works |
| `/images/generations` | `/v1/images/generations` | works |
| `/audio/speech` | `/v1/audio/speech` | works |
| `/search` | — | **not supported** |
| `/audio/voices` | — | **not supported** |
| — | `/v1/models` | used for the dynamic picker |

So chat, image generation and read-aloud all work. Web search and the voice
picker are hidden rather than left to fail with a 404, because a control that
cannot work is worse than no control.

## Setup

**Settings → Provider → FreeLLMAPI** fills the base URL with
`http://localhost:3001/v1`. Paste your unified `freellmapi-…` key. Press **Test**
and the model list appears, populated from `/v1/models`.

That preset assumes the router runs on the machine you are browsing from. It has
to, unless you host it — see below.

## Hosting it publicly

You asked for this, so here is the part worth reading before you do it.

**Your Next.js server has to be able to reach the router.** The app is deployed on
Vercel, in someone else's cloud, and it forwards `x-base-url` server-side. A
router on your laptop is unreachable from there. That is the whole reason this
needs a decision.

The trade-off, stated plainly:

FreeLLMAPI's README describes it as **"local-first and single-user by design"**,
with provider keys AES-256-GCM encrypted in a local SQLite file. Hosting it means
all of that stops being a local property:

- **The key store becomes internet-facing.** A bug in its auth, or a dashboard
  token leaked, exposes every provider key behind it at once. Encrypted at rest is
  not the same as inaccessible.
- **Rate limits stop being yours.** Free tiers are per-account. Everyone hitting
  your router shares one budget, and one abuser exhausts it for everyone.
- **The router phones home** to `freellmapi.co` for catalog updates. That is
  documented and opt-out is not obvious, so check it before exposing it.
- **Your provider keys transit your host.** Whoever runs it can read them.

If you host it anyway, at minimum: put it behind a reverse proxy with TLS, use
one of the revocable URL tokens rather than the dashboard token, keep
`FREELLMAPI_DASHBOARD_TOKEN` out of any repo, and give it a dedicated set of
provider keys rather than your good ones.

**A safer middle path** is to skip hosting and just run the router locally. The
preset works as-is if you browse the site from the same machine — the only
missing piece is that the Vercel server cannot reach `localhost`, so chat would
fail. That is a small piece of client-side work: have the browser call the router
directly, which needs CORS opened on the router and moves the key into the
browser, where it already is for the hosted case.

## SSRF

`/api/test-provider` fetches a URL the caller supplies, so it carries the same
risk as `/api/image-proxy` and applies the same guard: http(s) only, with
loopback, private ranges, `.local` and the cloud metadata endpoints refused. A
test button is still a server-side fetch, and without that guard it would be an
open proxy for anything Vercel can reach.

## Privacy

If you route through FreeLLMAPI, your prompts, messages, attached images and
extracted file text pass through it before reaching a model provider. The
**Data & privacy** page describes the direct-provider case. If you adopt this,
that page needs a row for it — the honest fix is to add the router to the
third-party table rather than leave the page describing a path nobody uses.
