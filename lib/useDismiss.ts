"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Animate an overlay both ways.
 *
 * The overlays used to mount and unmount instantly, so they only ever had an
 * "open" animation and vanished on close. This holds the element in the DOM
 * for the length of the exit animation, so the two directions match.
 *
 *   const { render, closing, requestClose } = useDismiss(open, onClose);
 *   if (!render) return null;
 *   return <div className={`panel${closing ? " is-closing" : ""}`}>…</div>;
 *
 * `onClose` may be called by a button, the Escape key, or a backdrop click;
 * all of them go through requestClose so the exit always plays.
 */

export const DISMISS_MS = 200;

export function useDismiss(open: boolean, onClose: () => void, ms: number = DISMISS_MS) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  // Kept in a ref so requestClose stays stable and does not retrigger effects.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (open) {
      clear();
      setRender(true);
      // Flip on the next frame so the opening transition has a start state.
      const id = window.requestAnimationFrame(() => setClosing(false));
      return () => window.cancelAnimationFrame(id);
    }
    if (!render) return;
    setClosing(true);
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRender(false);
      setClosing(false);
    }, ms);
    return clear;
  }, [open, render, ms]);

  useEffect(() => clear, []);

  /** Ask to close. Plays the exit animation, then really closes. */
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRender(false);
      setClosing(false);
      closeRef.current();
    }, ms);
  }, [closing, ms]);

  return { render, closing, requestClose };
}
