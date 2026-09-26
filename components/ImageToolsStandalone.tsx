"use client";

import { useEffect, useState } from "react";
import { ImageTools } from "./ToolsPage";

/**
 * The image tool on a standalone /tools/image page.
 *
 * The landing page links straight to the downloader with ?dir=download, so the
 * opening view has to come from the query string.
 *
 * Read on the client rather than through a `searchParams` prop on purpose. A
 * page that takes `searchParams` cannot be statically prerendered, and these
 * seven pages are meant to be static: real URLs, served from cache, indexable.
 * A one-line effect after mount costs nothing and keeps them that way.
 */
export default function ImageToolsStandalone({ notify }: { notify: (m: string) => void }) {
  const [dir, setDir] = useState<"edit" | "download" | undefined>(undefined);

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("dir");
    if (want === "download") setDir("download");
  }, []);

  return <ImageTools notify={notify} initialDir={dir} />;
}
