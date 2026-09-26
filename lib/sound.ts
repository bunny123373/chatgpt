"use client";

/**
 * Message sounds, synthesised in the browser.
 *
 * No audio files: a couple of short oscillators shaped by a gain envelope.
 * That keeps the bundle small and means nothing has to be downloaded before
 * the first sound plays, which matters because browsers only allow audio after
 * a user gesture -- and sending a message is exactly that.
 *
 * Every entry point is safe to call when the context is missing, suspended, or
 * the user has sound turned off. Sounds never throw.
 */

type SoundName = "send" | "receive" | "error";

let ctx: AudioContext | null = null;
let unlocked = false;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Browsers start the context suspended until a gesture happens. Calling this
 * from the first real interaction means the first sound is not swallowed.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

interface Tone {
  /** Frequency in Hz. */
  freq: number;
  /** Offset from the start, in seconds. */
  at?: number;
  /** How long the note lasts. */
  dur: number;
  type?: OscillatorType;
  /** Peak gain for this note. */
  peak: number;
  /** Optional glide to this frequency across the note. */
  to?: number;
}

const VOICES: Record<SoundName, { notes: Tone[]; gain: number }> = {
  // Two quick notes rising: reads as "sent".
  send: {
    gain: 0.05,
    notes: [
      { freq: 520, dur: 0.075, peak: 1, type: "sine" },
      { freq: 780, at: 0.055, dur: 0.11, peak: 0.85, type: "sine" },
    ],
  },
  // A single soft note landing: reads as "reply ready".
  receive: {
    gain: 0.045,
    notes: [
      { freq: 660, dur: 0.1, peak: 1, type: "sine" },
      { freq: 990, at: 0.05, dur: 0.14, peak: 0.5, type: "sine" },
    ],
  },
  // A short fall, for a failed send.
  error: {
    gain: 0.05,
    notes: [
      { freq: 340, to: 190, dur: 0.18, peak: 1, type: "triangle" },
    ],
  },
};

/** Play one of the sounds. A no-op when sound is disabled or audio is blocked. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  // Autoplay can leave the context suspended even after a gesture.
  if (c.state === "suspended") {
    void c.resume().then(() => emit(c, name)).catch(() => undefined);
    return;
  }
  emit(c, name);
}

function emit(c: AudioContext, name: SoundName): void {
  const spec = VOICES[name];
  if (!spec) return;
  const now = c.currentTime;

  try {
    const master = c.createGain();
    master.gain.value = spec.gain;
    // Fade the whole thing out so it can never click on stop.
    master.connect(c.destination);

    for (const note of spec.notes) {
      const osc = c.createOscillator();
      const env = c.createGain();
      const start = now + (note.at ?? 0);
      const end = start + note.dur;

      osc.type = note.type ?? "sine";
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);

      // Short attack, exponential decay: a plucked shape rather than a beep.
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(note.peak, start + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    /* never let a sound break the app */
  }
}
