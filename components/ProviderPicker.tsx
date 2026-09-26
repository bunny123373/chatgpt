"use client";

import { useEffect, useRef, useState } from "react";
import { PROVIDERS, providerForUrl } from "@/lib/providers";
import { fetchProviderModels } from "@/lib/providerProbe";
import type { Settings } from "@/lib/types";

/**
 * Provider switcher for the chat topbar.
 *
 * Settings owns the full configuration, but changing provider mid-conversation
 * is an obvious thing to want and making it a trip into Settings for it is a
 * needless interruption. Selecting here does the same three things Settings does:
 * set the base URL, take that provider's default model, and re-fetch its models.
 *
 * The cached model list is dropped on switch rather than kept. It belongs to the
 * provider that produced it, and showing a new provider's picker with the old
 * provider's models would be worse than showing nothing until the fetch lands.
 */
export default function ProviderPicker({
  settings,
  onChange,
  onNote,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onNote: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const current = providerForUrl(settings.baseUrl);
  const label = current?.label ?? "Custom";

  // Close on an outside click and on Escape, so the menu is dismissible without
  // hunting for a close button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (p: (typeof PROVIDERS)[number]) => {
    setOpen(false);
    if (p.baseUrl === settings.baseUrl.trim()) return;

    // Clear the previous provider's models first. Showing the old list against
    // the new provider would offer choices that cannot work.
    onChange({ ...settings, baseUrl: p.baseUrl, model: p.defaultModel, remoteModels: undefined });
    onNote(`Switched to ${p.label}.`);

    setBusy(p.id);
    const probe = await fetchProviderModels(settings.apiKey, p.baseUrl);
    setBusy(null);

    if (probe.ok && probe.models?.length) {
      onChange({ ...settings, baseUrl: p.baseUrl, model: p.defaultModel, remoteModels: probe.models });
      onNote(
        `${p.label}: ${probe.count} free model${probe.count === 1 ? "" : "s"}${probe.total && probe.total > (probe.count ?? 0) ? `, free only, out of ${probe.total}` : ""}.`,
      );
    } else {
      onNote(`${p.label} did not answer: ${probe.error ?? "no model list."}`);
    }
  };

  return (
    <div className="prov-pick" ref={wrapRef}>
      <button
        type="button"
        className="prov-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Provider: ${label}. Switch to try another.`}
      >
        <span className="prov-dot" data-id={current?.id ?? "custom"} aria-hidden />
        <span className="prov-label">{label}</span>
      </button>

      {open ? (
        <div className="menu prov-menu" role="menu">
          {PROVIDERS.map((p) => {
            const on = p.baseUrl === settings.baseUrl.trim();
            return (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={`menu-item${on ? " sel" : ""}`}
                aria-checked={on}
                onClick={() => void pick(p)}
                disabled={busy === p.id}
              >
                <span className="mi-t">
                  {p.label}
                  <span className="mi-d">
                    {busy === p.id ? "Checking…" : p.note || p.baseUrl}
                  </span>
                </span>
                {on ? <span className="tick">✓</span> : null}
              </button>
            );
          })}
          <div className="menu-sep" />
          <p className="prov-hint">
            Keys and base URLs are in Settings. Switching here only changes which provider is asked.
          </p>
        </div>
      ) : null}
    </div>
  );
}
