"use client";

/**
 * Animated 2D backdrop: five soft colour blobs drifting slowly behind a page.
 *
 * Shared by the landing page and the chat view so there is one implementation of
 * the effect. The two differ only in intensity, which is the `variant` prop.
 *
 * Why real elements rather than an animated background-image: CSS keyframes
 * cannot address individual shapes inside a rasterised background, and SMIL
 * inside an SVG used as a background-image does not run reliably across
 * browsers. Separate elements each animate independently.
 *
 * Why radial-gradients rather than blurred divs: `filter: blur()` over a shape
 * this large makes the browser re-rasterise a huge surface whenever anything
 * above it changes. A gradient is painted once and thereafter only transformed.
 * Every keyframe in the stylesheet animates `transform` alone, so the blobs stay
 * composited on the GPU and the animation never touches layout or paint.
 *
 * The element is `aria-hidden` and inert. It is decoration: it must never be
 * announced by a screen reader and must never intercept a click.
 */
export default function Backdrop({ variant = "landing" }: { variant?: "landing" | "app" }) {
  return (
    <div className={`land-bg land-bg-${variant}`} aria-hidden="true">
      <span className="land-blob b1" />
      <span className="land-blob b2" />
      <span className="land-blob b3" />
      <span className="land-blob b4" />
      <span className="land-blob b5" />
    </div>
  );
}
