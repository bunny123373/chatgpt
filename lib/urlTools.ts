"use client";

/**
 * URL parsing and building.
 *
 * Uses the platform URL parser, so it agrees with the browser about ports,
 * punycode, and relative resolution. Pairing and percent-decoding are done by
 * hand because URL exposes neither.
 */

export interface ParsedUrl {
  ok: boolean;
  error?: string;
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  /** Host with the port, as written. */
  host: string;
  port: string;
  pathname: string;
  /** Decoded path, for readability. */
  prettyPath: string;
  search: string;
  hash: string;
  origin: string;
  params: UrlParam[];
  /** Same as params, sorted by key then value. */
  sortedParams: UrlParam[];
}

export interface UrlParam {
  key: string;
  value: string;
  /** True when the pair had no "=" and so is a bare flag. */
  flag: boolean;
}

export interface BuildOptions {
  protocol?: string;
  host?: string;
  port?: string;
  path?: string;
  params?: { key: string; value: string; flag?: boolean }[];
  hash?: string;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseUrl(input: string): ParsedUrl {
  const empty: ParsedUrl = {
    ok: false,
    error: "",
    href: "",
    protocol: "",
    username: "",
    password: "",
    hostname: "",
    host: "",
    port: "",
    pathname: "",
    prettyPath: "",
    search: "",
    hash: "",
    origin: "",
    params: [],
    sortedParams: [],
  };

  const trimmed = input.trim();
  if (!trimmed) return { ...empty, error: "Enter a URL." };

  let url: URL;
  try {
    // A bare host like "example.com/x" is a common paste; assume https.
    url = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`);
  } catch {
    return { ...empty, error: "That is not a valid URL." };
  }

  const params: UrlParam[] = [];
  // split("&") on purpose: a ";" separator is not valid in modern query strings.
  for (const pair of url.search.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) params.push({ key: safeDecode(pair), value: "", flag: true });
    else params.push({ key: safeDecode(pair.slice(0, eq)), value: safeDecode(pair.slice(eq + 1).replace(/\+/g, " ")), flag: false });
  }

  const sorted = [...params].sort(
    (a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value)
  );

  return {
    ok: true,
    href: url.href,
    protocol: url.protocol.replace(":", ""),
    username: safeDecode(url.username),
    password: url.password ? "•".repeat(url.password.length) : "",
    hostname: url.hostname,
    host: url.host,
    port: url.port,
    pathname: url.pathname,
    prettyPath: safeDecode(url.pathname),
    search: url.search,
    hash: url.hash.replace("#", ""),
    origin: url.origin,
    params,
    sortedParams: sorted,
  };
}

function encodePair(key: string, value: string, flag?: boolean): string {
  const k = encodeURIComponent(key);
  return flag ? k : `${k}=${encodeURIComponent(value)}`;
}

export function buildUrl(opts: BuildOptions): string {
  const protocol = (opts.protocol || "https").replace(/:?$/, "");
  let host = (opts.host || "").trim();
  if (!host) throw new Error("A host is required.");
  // Accept "example.com:8080" typed into the host box.
  if (opts.port && !host.includes(":")) host = `${host}:${opts.port}`;

  const path = (opts.path || "").trim();
  const pathPart = path && !path.startsWith("/") ? `/${path}` : path;

  const query = (opts.params || [])
    .filter((p) => p.key !== "")
    .map((p) => encodePair(p.key, p.value, p.flag))
    .join("&");

  const hash = (opts.hash || "").trim();

  return `${protocol}://${host}${pathPart}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/** A few presets so the builder is useful without typing. */
export const URL_PRESETS: { label: string; build: () => BuildOptions }[] = [
  {
    label: "Search",
    build: () => ({
      protocol: "https",
      host: "www.google.com",
      path: "/search",
      params: [{ key: "q", value: "" }],
    }),
  },
  {
    label: "YouTube search",
    build: () => ({
      protocol: "https",
      host: "www.youtube.com",
      path: "/results",
      params: [{ key: "search_query", value: "" }],
    }),
  },
  {
    label: "Wikipedia",
    build: () => ({ protocol: "https", host: "en.wikipedia.org", path: "/wiki/" }),
  },
  {
    label: "GitHub repo",
    build: () => ({ protocol: "https", host: "github.com", path: "/" }),
  },
  {
    label: "API request",
    build: () => ({
      protocol: "https",
      host: "api.example.com",
      path: "/v1/items",
      params: [
        { key: "limit", value: "10" },
        { key: "sort", value: "created" },
        { key: "verbose", value: "", flag: true },
      ],
    }),
  },
];

export interface QueryEncoding {
  raw: string;
  decoded: string;
  json: string;
}

/** Decode a raw query string to readable text and to JSON. */
export function describeQuery(search: string): QueryEncoding {
  const raw = search.replace(/^\?/, "");
  const params = parseUrl(`https://x.com/?${raw}`);
  const obj: Record<string, string | string[]> = {};
  for (const p of params.params) {
    if (p.key in obj) {
      const cur = obj[p.key];
      obj[p.key] = Array.isArray(cur) ? [...cur, p.value] : [cur, p.value];
    } else {
      obj[p.key] = p.flag ? "" : p.value;
    }
  }
  return {
    raw,
    decoded: params.params.map((p) => (p.flag ? p.key : `${p.key} = ${p.value}`)).join("\n"),
    json: JSON.stringify(obj, null, 2),
  };
}
