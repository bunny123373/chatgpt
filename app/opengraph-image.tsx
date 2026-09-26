import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * The N mark, lifted from public/icon.svg.
 *
 * Inlined as a string rather than imported: satori cannot render a React SVG
 * component, and it will not fetch a relative path at build time either. A data
 * URI is the one form it reliably accepts. The background rect from the favicon
 * is dropped so the mark sits directly on the card, and the stroke is recoloured
 * to match the card's text rather than baked as #ececec.
 */
const MARK = [
  // The favicon's N occupies only the middle ~10 of its 24-unit box, so the
  // viewBox is cropped to frame the mark rather than the empty margin.
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="5.6 5.6 12.8 12.8">',
  '<g fill="none" stroke="#f2f4f8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M7 17V7"/><path d="M7 7l5 10"/><path d="M12 17l5-10"/>',
  "</g></svg>",
].join("");

const MARK_URI = `data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`;

/**
 * Open Graph / Twitter share card, rendered to PNG at build time.
 *
 * Generated rather than checked in as a binary so the text can never drift from
 * SITE_NAME and SITE_DESCRIPTION, and so there is no 1200x630 image in the repo
 * that goes stale the moment the copy changes.
 *
 * Satori, which does the rendering, supports a deliberately small subset of CSS:
 * flexbox only, every element needs explicit dimensions, and there is no
 * shorthand for anything. No `gap` in some versions, no `background-clip`, and
 * `display: flex` is required on any element with more than one child.
 */
export const alt = `${SITE_NAME} — AI chat with streaming, images, files and browser-based tools`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          // Matches the app's dark canvas so the card does not flash white in a
          // dark feed.
          backgroundColor: "#0b0d12",
          backgroundImage:
            "radial-gradient(900px 520px at 12% 8%, rgba(99,102,241,0.42) 0%, rgba(99,102,241,0) 62%), radial-gradient(820px 500px at 88% 16%, rgba(168,85,247,0.36) 0%, rgba(168,85,247,0) 60%), radial-gradient(760px 460px at 52% 96%, rgba(34,211,238,0.22) 0%, rgba(34,211,238,0) 58%)",
          color: "#f2f4f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 58,
              height: 58,
              borderRadius: 15,
              backgroundColor: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            <img src={MARK_URI} width={30} height={30} alt="" />
          </div>
          <div style={{ display: "flex", marginLeft: 18, fontSize: 30, fontWeight: 600, letterSpacing: -0.02 }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -0.03,
            }}
          >
            AI chat that keeps your conversations on your own device
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#a8b0c0", maxWidth: 800, lineHeight: 1.4 }}>
            Streaming replies, image understanding, file attachments, web search, and tools that run entirely in
            your browser.
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.06)",
              fontSize: 22,
              color: "#dfe4ee",
              whiteSpace: "nowrap",
            }}
          >
            No tracking
          </div>
        </div>
      </div>
    ),
    size,
  );
}

/** Referenced from the page metadata so the card and the alt text cannot drift. */
export function ogAlt(): string {
  return alt;
}

/** Trimmed description for the card's supporting line, kept short on purpose. */
export function ogDescription(): string {
  return SITE_DESCRIPTION.split(".")[0] + ".";
}
