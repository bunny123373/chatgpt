# Cross-device sync

Sign in on one device, sign in on another, and the same conversations are there.

## What this is

Opt-in sync of your chats to your own Firebase account, one Firestore document
per conversation, at `users/{uid}/chats/{chatId}`.

**Off by default.** This is the only feature in the app that sends conversation
content to a server, so it is never assumed. An existing profile stays off when
upgraded rather than acquiring it by default — see `merged.sync` in
`lib/store.ts`.

## You have to do three things first

Sync will not work until all of these are done. The code is written and
compiles, but it needs the server side to exist.

### 1. Create the Firestore database

**This is the step that is easy to miss and the app cannot do for you.**

1. Open the Firebase console → your project (`chatgpt-36f22`)
2. **Build → Firestore Database → Create database**
3. Choose a region. Pick the one closest to your users; it cannot be changed
   later.
4. Start in **production mode** — the rules below will protect it. Do **not**
   start in test mode.

Until this is done, sync reports "Sync is unavailable: Firestore is not enabled on
this Firebase project" and the app carries on working normally. That is the
designed behaviour, not a crash.

### 2. Deploy the security rules

```bash
npm install -g firebase-tools
firebase login
firebase use chatgpt-36f22
firebase deploy --only firestore:rules
```

`firestore.rules` in the repo root is the one to deploy. It grants a signed-in
user read and write on their own `users/{uid}/chats` path and denies everything
else.

**Read it before you deploy.** If these rules are ever replaced with
`allow read, write: if true`, every user's conversations become world-readable
and nothing in the client would reveal it. There is no wildcard allow in the file
on purpose.

### 3. Restart the app

`getFirestoreDb` deliberately does not cache a failure, so a reload is enough
once Firestore exists.

## How it behaves

| | |
|---|---|
| **Pull** | Once per account when the toggle is on, and whenever the account changes |
| **Push** | 2.5 s after changes settle, keyed on the newest `updatedAt` |
| **Conflict** | Last write wins, per chat |
| **Delete** | Propagated to the server immediately, so it does not come back |
| **Chats kept locally** | Everything still works offline and with sync off |

Last-write-wins per chat, not per message. That is right for one person on two
devices, where the realistic conflict is "I wrote a reply on my laptop while my
phone had the chat open". Per-message merging is for two people editing one
document at once, which is not this case.

## Known limitations

**Deletions do not propagate backwards.** Deleting a chat on device A removes it
from the server, so it will not return on device B. But if device A never
deletes it and device B does, the delete is local only unless sync is on when it
happens.

**Large chats lose their images.** Firestore caps a document at 1 MiB. An
oversized chat is synced without attachment bytes and the UI says so by name,
rather than silently dropping them. The text always syncs. The stripped files
are marked `FileRef.stripped` so the other device can explain itself.

**There is no real-time listener.** Sync is pull-on-sign-in plus a debounced
push. Two devices open at once will not see each other's edits until something
triggers a pass. A `onSnapshot` listener would fix it, at the cost of a
persistent connection and a read on every keystroke settling.

**Erase-all does not wipe the server.** Turning sync off does not remove
previously synced data. Delete conversations while sync is on, or ask.

## Why per-chat documents

One blob per user would hit the 1 MiB limit after a handful of conversations.
Per-chat means the limit applies per conversation, which is the granularity
people actually care about, and deleting one chat is a single document delete.
