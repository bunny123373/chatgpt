/**
 * Read-aloud.
 * Primary: xKiro TTS (`POST /v1/audio/speech`, model `xkiro-voice`) — natural
 * premium voices picked in Settings. The MP3 is streamed back through the
 * server proxy so the API key never touches the browser.
 * Fallback: the Web Speech API when there's no key or a request fails.
 * One utterance at a time across the whole app.
 */

import { peekSettings } from "@/lib/store";

let activeId: string | null = null;
let seq = 0;
let audioEl: HTMLAudioElement | null = null;

/** Rough markdown → spoken text (drops code fences, links, emphasis). */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => {
      const code = m.replace(/```[^\n]*\n?/, "").replace(/```$/, "").trim();
      return code ? `Code block: ${code}` : "";
    })
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeaking(id: string): boolean {
  return activeId === id;
}

/** Read persisted settings (apiKey/baseUrl/voice/speed/pitch) straight from the per-account store. */
function ttsSettings(): { key: string; base: string; voice: string; speed: number; pitch: number } {
  const s = peekSettings();
  const num = (v: unknown, min: number, max: number, dflt: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
  return {
    key: typeof s.apiKey === "string" ? s.apiKey.trim() : "",
    base: (
      (typeof s.baseUrl === "string" && s.baseUrl ? s.baseUrl : "https://api.xkiro.com/v1")
    ).replace(/\/+$/, ""),
    voice: typeof s.ttsVoice === "string" && s.ttsVoice ? s.ttsVoice : "american-female",
    speed: num(s.ttsSpeed, 0.5, 2, 1),
    pitch: num(s.ttsPitch, -10, 10, 0),
  };
}

/** Browser fallback utterance. */
function speakBrowser(text: string, onDone: () => void, speed = 1, pitchShift = 0): void {
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en[-_](US|GB)/i.test(v.lang) && /natural|google/i.test(v.name)) ||
    voices.find((v) => /^en[-_]/i.test(v.lang)) ||
    voices[0];
  if (preferred) u.voice = preferred;
  u.rate = Math.min(2, Math.max(0.5, speed));
  u.pitch = Math.min(2, Math.max(0, 1 + pitchShift / 20));
  u.onend = onDone;
  u.onerror = onDone;
  window.speechSynthesis.speak(u);
}

function clearAudio(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl = null;
  }
}

/** Start reading `text` for message `id`. Returns true if it started. */
export function speak(id: string, text: string, onEnd?: () => void): boolean {
  stopSpeaking();
  const clean = plainText(text).slice(0, 4000);
  if (!clean) {
    onEnd?.();
    return false;
  }
  activeId = id;
  seq += 1;
  const my = seq;
  const done = () => {
    if (activeId === id && seq === my) activeId = null;
    onEnd?.();
  };

  const { key, base, voice, speed, pitch } = ttsSettings();
  if (key) {
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "x-base-url": base },
      body: JSON.stringify({ text: clean, voice, speed, pitch }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        audioEl = el;
        el.onended = () => {
          clearAudio();
          done();
        };
        el.onerror = () => {
          clearAudio();
          done();
        };
        return el.play();
      })
      .catch(() => {
        if (seq !== my) return;
        clearAudio();
        if (speechSupported()) {
          speakBrowser(clean, done, speed, pitch);
        } else {
          done();
        }
      });
    return true;
  }

  if (!speechSupported()) {
    done();
    return false;
  }
  speakBrowser(clean, done, speed, pitch);
  return true;
}

export function stopSpeaking(): void {
  clearAudio();
  if (speechSupported()) {
    window.speechSynthesis.cancel();
  }
  activeId = null;
}

/** Kick the TTS engine so getVoices() is populated (Chrome quirk, fallback path only). */
export function primeVoices(): void {
  if (speechSupported() && window.speechSynthesis.getVoices().length === 0) {
    const u = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  }
}