"use client";

import { useEffect, useState } from "react";
import { BUBBLE_COLORS, DEFAULT_SETTINGS, MODELS, type AuthUser, type Settings } from "@/lib/types";
import { BackIcon } from "./Icons";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
  onExportChats: () => void;
  onImportChats: (file: File) => void;
  onClearAll: () => void;
  /** Signed-in account (null in anonymous mode — hides the sign-out row). */
  user?: AuthUser | null;
  onSignOut?: () => void;
}

type TabId = "general" | "voice" | "data" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "voice", label: "Voice" },
  { id: "data", label: "Data controls" },
  { id: "account", label: "Account" },
];

export default function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onExportChats,
  onImportChats,
  onClearAll,
  user,
  onSignOut,
}: Props) {
  const [tab, setTab] = useState<TabId>("general");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);

  // ChatGPT-style: changes apply live — start each open on General.
  useEffect(() => {
    if (open) setTab("general");
  }, [open]);

  // Load the premium xKiro TTS voices for the read-aloud voice picker.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setVoices([]);
    fetch("/api/voices", {
      headers: {
        "x-api-key": settings.apiKey.trim(),
        "x-base-url": settings.baseUrl.trim(),
      },
    })
      .then((r) => (r.ok ? r.json() : { voices: [] }))
      .then((d: { voices?: { id: string; name: string }[] }) => {
        if (live) setVoices(Array.isArray(d.voices) ? d.voices : []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, settings.apiKey, settings.baseUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onSave({ ...settings, [k]: v });
  const tabs = TABS.filter((t) => t.id !== "account" || Boolean(user));

  return (
    <div className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
      <aside className="set-side">
        <div className="set-side-head">
          <button className="set-back" type="button" onClick={onClose} title="Back to chat" aria-label="Back to chat">
            <BackIcon />
          </button>
          <span>Settings</span>
        </div>
        <nav className="set-nav" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`set-nav-item${tab === t.id ? " active" : ""}`}
              aria-current={tab === t.id ? "true" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="set-main">
        <div className="set-inner">
            {tab === "general" ? (
              <>
                <h3 className="set-heading">General</h3>
                <p className="set-desc">Connection, model and appearance settings.</p>

                <div className="set-row col">
                  <label htmlFor="apiKey" className="set-label">
                    API key
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-… (leave empty for offline demo)"
                    value={settings.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                  />
                  <p className="help">
                    Stored only in this browser and sent with each request to <b>this app&apos;s own</b> server route,
                    which forwards it to the provider. For production, put it in <code>.env.local</code> instead and
                    leave this field empty.
                  </p>
                </div>

                <div className="set-row col">
                  <label htmlFor="baseUrl" className="set-label">
                    API base URL
                  </label>
                  <input
                    id="baseUrl"
                    type="text"
                    spellCheck={false}
                    placeholder={DEFAULT_SETTINGS.baseUrl}
                    value={settings.baseUrl}
                    onChange={(e) => set("baseUrl", e.target.value)}
                  />
                  <p className="help">
                    Any OpenAI-compatible endpoint works — xKiro, OpenAI, Groq, Together, OpenRouter, Ollama, vLLM.
                  </p>
                </div>

                <div className="set-row col">
                  <label htmlFor="model" className="set-label">
                    Model
                  </label>
                  <input
                    id="model"
                    type="text"
                    spellCheck={false}
                    list="model-options"
                    placeholder={DEFAULT_SETTINGS.model}
                    value={settings.model}
                    onChange={(e) => set("model", e.target.value)}
                  />
                  <datalist id="model-options">
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id} />
                    ))}
                  </datalist>
                  <p className="help">Type any model id your endpoint supports.</p>
                </div>

                <div className="set-row col">
                  <label htmlFor="temp" className="set-label">
                    Temperature — {settings.temperature.toFixed(2)}
                  </label>
                  <input
                    id="temp"
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.temperature}
                    onChange={(e) => set("temperature", Number(e.target.value))}
                  />
                  <p className="help">Lower is more focused and deterministic; higher is more creative.</p>
                </div>

                <div className="set-row col">
                  <label htmlFor="sys" className="set-label">
                    System prompt
                  </label>
                  <textarea id="sys" value={settings.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
                </div>

                <div className="set-row col">
                  <label htmlFor="nick" className="set-label">
                    Display name
                  </label>
                  <input id="nick" type="text" value={settings.nickname} onChange={(e) => set("nickname", e.target.value)} />
                </div>

                <div className="set-row">
                  <span className="set-label">
                    Streaming responses
                    <small>Show tokens as they arrive instead of waiting for the full reply.</small>
                  </span>
                  <button
                    type="button"
                    className={`toggle${settings.streaming ? " on" : ""}`}
                    aria-label="Toggle streaming"
                    aria-pressed={settings.streaming}
                    onClick={() => set("streaming", !settings.streaming)}
                  />
                </div>

                <div className="set-row">
                  <span className="set-label">
                    Light theme
                    <small>Switch between the dark and light palettes.</small>
                  </span>
                  <button
                    type="button"
                    className={`toggle${settings.theme === "light" ? " on" : ""}`}
                    aria-label="Toggle light theme"
                    aria-pressed={settings.theme === "light"}
                    onClick={() => set("theme", settings.theme === "light" ? "dark" : "light")}
                  />
                </div>

                <div className="set-row col">
                  <span className="set-label">User bubble color</span>
                  <div className="swatches">
                    {BUBBLE_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        aria-label={`Bubble color: ${c.label}`}
                        aria-pressed={settings.bubbleColor === c.value}
                        className={`swatch${settings.bubbleColor === c.value ? " on" : ""}`}
                        style={{ background: c.swatch }}
                        onClick={() => set("bubbleColor", c.value)}
                      />
                    ))}
                  </div>
                  <p className="help">Pick the color of your chat bubbles — applied to every conversation.</p>
                </div>
              </>
            ) : null}

            {tab === "voice" ? (
              <>
                <h3 className="set-heading">Voice</h3>
                <p className="set-desc">Choose the voice used by the 🔊 Listen button on assistant replies.</p>

                <div className="set-row col">
                  <label htmlFor="tts" className="set-label">
                    Read-aloud voice
                  </label>
                  <select id="tts" value={settings.ttsVoice} onChange={(e) => set("ttsVoice", e.target.value)}>
                    {voices.length === 0 ? (
                      <option value={settings.ttsVoice || "american-female"}>
                        {settings.ttsVoice || "american-female"}
                      </option>
                    ) : null}
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <p className="help">
                    {voices.length
                      ? `${voices.length} premium xKiro voices — used by the 🔊 Listen button on replies.`
                      : "Premium voices appear here when your API key is set (Settings → General → API key)."}
                  </p>
                </div>

                <div className="set-row col">
                  <label htmlFor="ttsSpeed" className="set-label">
                    Speed — {settings.ttsSpeed.toFixed(2)}×
                  </label>
                  <input
                    id="ttsSpeed"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={settings.ttsSpeed}
                    onChange={(e) => set("ttsSpeed", Number(e.target.value))}
                  />
                </div>

                <div className="set-row col">
                  <label htmlFor="ttsPitch" className="set-label">
                    Pitch — {settings.ttsPitch > 0 ? `+${settings.ttsPitch}` : settings.ttsPitch}
                  </label>
                  <input
                    id="ttsPitch"
                    type="range"
                    min={-10}
                    max={10}
                    step={1}
                    value={settings.ttsPitch}
                    onChange={(e) => set("ttsPitch", Number(e.target.value))}
                  />
                  <p className="help">Applies to both xKiro neural voices and the browser fallback.</p>
                </div>
              </>
            ) : null}

            {tab === "data" ? (
              <>
                <h3 className="set-heading">Data controls</h3>
                <p className="set-desc">Your conversations and settings are stored locally in this browser.</p>

                <div className="set-row">
                  <span className="set-label">
                    Backup chats
                    <small>Export every conversation to a JSON file, or restore one later.</small>
                  </span>
                  <span className="data-actions">
                    <button type="button" className="btn" onClick={onExportChats}>
                      Export
                    </button>
                    <label className="btn file-btn">
                      Import
                      <input
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onImportChats(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </span>
                </div>

                <div className="set-row">
                  <span className="set-label">
                    Delete all local data
                    <small>Removes every saved conversation and setting from this browser.</small>
                  </span>
                  <button type="button" className="btn danger" onClick={onClearAll}>
                    Clear
                  </button>
                </div>
              </>
            ) : null}

            {tab === "account" && user ? (
              <>
                <h3 className="set-heading">Account</h3>
                <p className="set-desc">Signed in as {user.email || user.name}.</p>

                <div className="set-row">
                  <span className="set-label">
                    Signed in
                    <small>{user.email || user.name} — chats &amp; settings are stored under this account.</small>
                  </span>
                  <button type="button" className="btn danger" onClick={onSignOut}>
                    Sign out
                  </button>
                </div>
              </>
            ) : null}
        </div>
      </div>
    </div>
  );
}