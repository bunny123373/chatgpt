"use client";

import { useCallback, useRef, useState } from "react";

export interface RunResult {
  ok: boolean;
  error: string | null;
  result: string | null;
  logs: string;
  rowCount: number;
  ms: number;
}

const TIMEOUT_MS = 5000;

/**
 * Run model-written JavaScript against `rows` inside a sandboxed Web Worker.
 *
 * The worker is created from a same-origin static file and killed after a
 * timeout, so infinite loops can't hang the app and the code has no access to
 * the DOM, network, or storage.
 */
export function useSandbox() {
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const run = useCallback((code: string, rows: unknown[]): Promise<RunResult> => {
    setRunning(true);
    const started = Date.now();

    return new Promise<RunResult>((resolve) => {
      let settled = false;
      const finish = (r: RunResult) => {
        if (settled) return;
        settled = true;
        setRunning(false);
        workerRef.current?.terminate();
        workerRef.current = null;
        resolve(r);
      };

      let worker: Worker;
      try {
        worker = new Worker("/sandbox-worker.js");
      } catch {
        finish({ ok: false, error: "Could not start the sandbox.", result: null, logs: "", rowCount: 0, ms: 0 });
        return;
      }
      workerRef.current = worker;

      const timer = setTimeout(() => {
        finish({
          ok: false,
          error: "The code took too long and was stopped (5s limit).",
          result: null,
          logs: "",
          rowCount: rows.length,
          ms: Date.now() - started,
        });
      }, TIMEOUT_MS);

      worker.onmessage = (e: MessageEvent<Omit<RunResult, "ms">>) => {
        clearTimeout(timer);
        finish({ ...e.data, ms: Date.now() - started });
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        finish({
          ok: false,
          error: e.message || "Sandbox error",
          result: null,
          logs: "",
          rowCount: rows.length,
          ms: Date.now() - started,
        });
      };

      worker.postMessage({ code, data: rows });
    });
  }, []);

  return { run, running };
}

/** Parse a CSV into an array of row objects. Handles quoted fields. */
export function parseCsv(text: string): { rows: Record<string, string>[]; columns: string[] } {
  const clean = text.replace(/\r\n?/g, "\n");
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else quoted = false;
        } else cur += ch;
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], columns: [] };

  const columns = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = cells[i] ?? "";
    });
    return obj;
  });
  return { rows, columns };
}

/** Coerce numeric-looking cells so averages/sums work without model effort. */
export function coerceRows(rows: Record<string, string>[]): Record<string, string | number>[] {
  return rows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r)) {
      const t = v.trim();
      if (t !== "" && /^-?\d+(\.\d+)?$/.test(t)) out[k] = Number(t);
      else out[k] = t;
    }
    return out;
  });
}
