"use client";

import { useEffect, useRef, useState } from "react";
import { BUBBLE_COLORS, DEFAULT_SETTINGS, MODELS, type AuthUser, type Project, type Settings } from "@/lib/types";
import { BackIcon, TrashIcon } from "./Icons";

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
  /** Project workspace management. */
  projects?: Project[];
  onProjects?: (next: Project[]) => void;
  onDeleteProject?: (id: string) => void;
  onNewProjectChat?: (projectId: string) => void;
  /** Persist the display name / photo to the sign-in provider. */
  onSyncProfile?: (displayName: string, photoDataUrl: string | null) => Promise<void>;
  /** Open on a specific section (e.g. "profile" from the account menu). */
  openTab?: TabId;
}

type TabId = "general" | "voice" | "profile" | "projects" | "data" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "voice", label: "Voice" },
  { id: "profile", label: "Profile" },
  { id: "projects", label: "Projects" },
  { id: "data", label: "Data controls" },
  { id: "account", label: "Account" },
];

const newProjectId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

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
  projects = [],
  onProjects,
  onDeleteProject,
  onNewProjectChat,
  onSyncProfile,
  openTab = "general",
}: Props) {
  const [tab, setTab] = useState<TabId>("general");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [draftName, setDraftName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  // Custom avatar if set, otherwise the provider's photo.
  const avatarPreview = settings.avatar || user?.image || "";
  const initials = (settings.profileName.trim() || user?.name || "?").trim()[0].toUpperCase();

  /** Downscale to a square JPEG so localStorage stays small. */
  const pickAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("read failed"));
        fr.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("decode failed"));
        im.src = dataUrl;
      });
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      // Centre-crop to a square, then draw.
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      set("avatar", canvas.toDataURL("image/jpeg", 0.82));
    } catch {
      /* ignore unreadable images */
    }
  };

  const setProjects = (next: Project[]) => onProjects?.(next);
  const createProject = () => {
    const name = draftName.trim();
    if (!name) return;
    const p: Project = { id: newProjectId(), name, instructions: "", createdAt: Date.now(), updatedAt: Date.now() };
    setProjects([p, ...projects]);
    setDraftName("");
  };
  const patchProject = (id: string, fn: (p: Project) => Project) =>
    setProjects(projects.map((p) => (p.id === id ? fn(p) : p)));
  const deleteProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
    onDeleteProject?.(id);
  };

  // ChatGPT-style: changes apply live — land on the requested section.
  useEffect(() => {
    if (open) setTab(openTab);
  }, [open, openTab]);

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

                <div className="set-row col">
                  <label htmlFor="instr" className="set-label">
                    Custom instructions
                  </label>
                  <textarea
                    id="instr"
                    value={settings.instructions}
                    placeholder="e.g. I'm a React developer. Always answer with TypeScript examples and keep answers concise."
                    onChange={(e) => set("instructions", e.target.value)}
                  />
                  <p className="help">
                    Applied to every conversation — Next AI will keep these preferences in mind until you change or clear them.
                  </p>
                </div>

                <div className="set-row">
                  <span className="set-label">
                    Show token &amp; cost
                    <small>Display tokens used and the estimated USD cost under each reply.</small>
                  </span>
                  <button
                    type="button"
                    className={`toggle${settings.showUsage ? " on" : ""}`}
                    aria-label="Toggle token and cost display"
                    aria-pressed={settings.showUsage}
                    onClick={() => set("showUsage", !settings.showUsage)}
                  />
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

            {tab === "profile" ? (
              <>
                <h3 className="set-heading">Profile</h3>
                <p className="set-desc">Your photo and names. Only the display name is shown in the app.</p>

                <div className="prof-top">
                  <div className="prof-av" aria-hidden>
                    {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{initials}</span>}
                  </div>
                  <div className="prof-av-actions">
                    <label className="btn file-btn">
                      {avatarPreview ? "Change photo" : "Upload photo"}
                      <input
                        ref={avatarInput}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void pickAvatar(f);
                        }}
                      />
                    </label>
                    {avatarPreview ? (
                      <button type="button" className="btn" onClick={() => set("avatar", "")}>
                        Remove
                      </button>
                    ) : null}
                    <p className="prof-hint">Square images work best. Stored in this browser only.</p>
                  </div>
                </div>

                <div className="set-row col">
                  <label htmlFor="dispName" className="set-label">
                    Display name
                  </label>
                  <input
                    id="dispName"
                    type="text"
                    maxLength={60}
                    placeholder={user?.name || "How you appear in the app"}
                    value={settings.profileName}
                    onChange={(e) => set("profileName", e.target.value)}
                  />
                  <p className="help">Shown next to your chats and in the sidebar. Falls back to your account name.</p>
                </div>

                <div className="set-row col">
                  <label htmlFor="realName" className="set-label">
                    Real name
                  </label>
                  <input
                    id="realName"
                    type="text"
                    maxLength={60}
                    placeholder="Your first and last name"
                    value={settings.realName}
                    onChange={(e) => set("realName", e.target.value)}
                  />
                  <p className="help">Kept private — never displayed in conversations or exports.</p>
                </div>

                {user?.email ? (
                  <div className="set-row col">
                    <span className="set-label">Email</span>
                    <p className="prof-email">{user.email}</p>
                  </div>
                ) : null}

                {onSyncProfile ? (
                  <div className="set-row">
                    <span className="set-label">
                      Sync to your account
                      <small>Save the display name and photo to your sign-in provider so they follow you to other devices.</small>
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={syncing}
                      onClick={async () => {
                        setSyncing(true);
                        try {
                          await onSyncProfile(settings.profileName.trim() || settings.realName.trim(), settings.avatar || null);
                        } finally {
                          setSyncing(false);
                        }
                      }}
                    >
                      {syncing ? "Syncing…" : "Sync"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === "projects" ? (
              <>
                <h3 className="set-heading">Projects</h3>
                <p className="set-desc">
                  Group related chats together and give them shared instructions the model always follows.
                </p>

                <div className="proj-new">
                  <input
                    type="text"
                    value={draftName}
                    placeholder="New project name"
                    maxLength={60}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createProject();
                      }
                    }}
                    aria-label="New project name"
                  />
                  <button type="button" className="btn primary" onClick={createProject} disabled={!draftName.trim()}>
                    Create
                  </button>
                </div>

                {projects.length === 0 ? (
                  <p className="lib-empty">No projects yet. Create one to group related chats.</p>
                ) : (
                  <div className="proj-list">
                    {projects.map((p) => (
                      <div key={p.id} className="proj">
                        <div className="proj-head">
                          <input
                            className="proj-name"
                            value={p.name}
                            maxLength={60}
                            aria-label="Project name"
                            onChange={(e) => patchProject(p.id, (x) => ({ ...x, name: e.target.value, updatedAt: Date.now() }))}
                          />
                          <button
                            type="button"
                            className="proj-del"
                            title={`Delete ${p.name}`}
                            aria-label={`Delete ${p.name}`}
                            onClick={() => deleteProject(p.id)}
                          >
                            <TrashIcon size={15} />
                          </button>
                        </div>
                        <textarea
                          className="proj-instr"
                          value={p.instructions}
                          placeholder="Shared instructions for every chat in this project…"
                          aria-label={`Instructions for ${p.name}`}
                          onChange={(e) =>
                            patchProject(p.id, (x) => ({ ...x, instructions: e.target.value, updatedAt: Date.now() }))
                          }
                        />
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            onNewProjectChat?.(p.id);
                            onClose();
                          }}
                        >
                          New chat in {p.name}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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