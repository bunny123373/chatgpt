import type { CollectionReference, Firestore } from "firebase/firestore";
import { getFirestoreDb } from "./firebase";
import type { Chat, Msg } from "./types";

/**
 * Cross-device chat sync, on Firestore.
 *
 * This is the one part of the app where conversation data leaves the device, and
 * it is deliberately opt-in. Until now the honest claim was that no server holds
 * a copy of anyone's chats; that stops being true the moment this runs, so it
 * has to be a switch the user flips rather than a default they are opted into.
 *
 * Layout: users/{uid}/chats/{chatId}, one document per conversation. Per-chat
 * rather than a single blob because Firestore caps a document at 1 MiB, and one
 * user with fifty conversations would hit that immediately.
 *
 * Merge rule: last-write-wins per chat, compared on updatedAt. Simple and
 * predictable. Per-message merging is what you want for two people editing one
 * document at once, which is not this situation; this is one person on two
 * devices, and the realistic conflict is "I wrote a reply on my laptop while my
 * phone had the chat open", where taking the newer chat is right.
 *
 * Attachments are the hard part. Images are stored as data URLs, so a chat with
 * a few photos can exceed the document limit. Rather than silently drop them, an
 * oversized chat is synced without attachment bytes and reported back, so the UI
 * can say so instead of the user discovering a missing image on another device.
 */

/** Firestore's hard per-document limit, less headroom for field names. */
const DOC_LIMIT = 900_000;

export type SyncOutcome =
  | { status: "off" }
  | { status: "unavailable" }
  | { status: "merged"; pulled: number; pushed: number; trimmed: string[] }
  | { status: "error"; message: string };

/** One chat as stored. Mirrors Chat, minus nothing, kept explicit for Firestore. */
interface ChatDoc {
  title: string;
  messages: Msg[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

function toDoc(chat: Chat): ChatDoc {
  return {
    title: chat.title,
    messages: chat.messages,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    ...(chat.pinned ? { pinned: true } : {}),
  };
}

function fromDoc(id: string, d: Record<string, unknown>): Chat {
  return {
    id,
    title: typeof d.title === "string" ? d.title : "New chat",
    messages: Array.isArray(d.messages) ? (d.messages as Msg[]) : [],
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
    ...(d.pinned ? { pinned: true } : {}),
  };
}

/** Close enough for a guard: JSON length proxies the encoded document size. */
function sizeOf(o: unknown): number {
  return JSON.stringify(o)?.length ?? 0;
}

/**
 * Strip attachment bytes so a chat fits.
 *
 * Keeps name, type and size so the message still reads on the other device, and
 * marks the file stripped so the UI can say the image did not come across
 * rather than rendering a broken chip.
 */
function stripBytes(chat: Chat): { doc: ChatDoc; trimmed: boolean } {
  let didStrip = false;
  const messages = chat.messages.map((m) => {
    if (!m.files?.length) return m;
    const files = m.files.map((f) => {
      if (!f.dataUrl) return f;
      didStrip = true;
      // `text` can be tens of thousands of characters of extracted PDF content,
      // which is usually the real weight here rather than the image itself.
      const { dataUrl: _d, text: _t, ...rest } = f;
      return { ...rest, stripped: true };
    });
    return { ...m, files };
  });
  return { doc: { ...toDoc(chat), messages }, trimmed: didStrip };
}

async function openCol(uid: string): Promise<{ f: typeof import("firebase/firestore"); col: CollectionReference }> {
  const db: Firestore = await getFirestoreDb();
  const f = await import("firebase/firestore");
  return { f, col: f.collection(db, "users", uid, "chats") };
}

/**
 * One sync pass: pull the remote set, merge with what is local, push what is
 * newer.
 *
 * Union-then-newest-wins. A chat only on the server is adopted, a chat in both
 * is taken from whichever side has the later updatedAt, a chat only local is
 * uploaded.
 *
 * Deletions are not propagated. Honouring a delete from one device would need
 * tombstones, since absence is indistinguishable from "never synced". That is a
 * documented limitation, not an oversight: a chat deleted on one device can
 * reappear from the other, and deleting again is the remedy.
 */
export async function syncChats(uid: string, local: Chat[], enabled: boolean): Promise<{ chats: Chat[]; outcome: SyncOutcome }> {
  if (!enabled) return { chats: local, outcome: { status: "off" } };

  let f: typeof import("firebase/firestore");
  let col: CollectionReference;
  try {
    ({ f, col } = await openCol(uid));
  } catch {
    // No Firestore in this project, or offline. Not worth interrupting anyone.
    return { chats: local, outcome: { status: "unavailable" } };
  }

  try {
    // ---- pull ----
    const snap = await f.getDocs(col);
    const remote = new Map<string, Chat>();
    snap.forEach((d) => {
      const chat = fromDoc(d.id, d.data() as Record<string, unknown>);
      remote.set(chat.id, chat);
    });

    const toPush: Chat[] = [];
    const merged = new Map<string, Chat>();

    for (const c of local) {
      const r = remote.get(c.id);
      if (!r) {
        toPush.push(c);
        merged.set(c.id, c);
      } else if (c.updatedAt > r.updatedAt) {
        toPush.push(c);
        merged.set(c.id, c);
      } else {
        merged.set(c.id, r);
      }
      remote.delete(c.id);
    }
    // Whatever remains on the server is new to this device.
    const pulled = remote.size;
    for (const c of remote.values()) merged.set(c.id, c);

    // ---- push ----
    let pushed = 0;
    const trimmed: string[] = [];

    for (const c of toPush) {
      let doc = toDoc(c);
      if (sizeOf(doc) > DOC_LIMIT) {
        const small = stripBytes(c);
        if (sizeOf(small.doc) > DOC_LIMIT) {
          // Still too large even without attachment bytes. Skip this one rather
          // than fail the whole pass, and report which chat did not sync.
          trimmed.push(c.title || "Untitled");
          continue;
        }
        doc = small.doc;
        trimmed.push(c.title || "Untitled");
        // Reflect the stripped copy locally too, so the two devices agree.
        merged.set(c.id, { ...c, messages: small.doc.messages });
      }
      await f.setDoc(f.doc(col, c.id), doc);
      pushed++;
    }

    const out = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    return { chats: out, outcome: { status: "merged", pulled, pushed, trimmed } };
  } catch (e) {
    return { chats: local, outcome: { status: "error", message: e instanceof Error ? e.message : "Sync failed." } };
  }
}

/** Remove one conversation from the server so it does not come back. */
export async function deleteRemoteChat(uid: string, chatId: string): Promise<void> {
  try {
    const { f, col } = await openCol(uid);
    await f.deleteDoc(f.doc(col, chatId));
  } catch {
    // A failed delete is not worth interrupting anyone over. Worst case the chat
    // returns on the next sync and can be deleted again.
  }
}
