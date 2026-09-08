import React from "react";

// One entry per shape the UI actually has a placeholder for. Adding a name here
// without a rule in style.scss renders a span with no size at all, so
// src/style/skeletonVariants.test.js reads this list against the stylesheet.
const SKELETON_VARIANTS = [
  "avatar",  // square portrait
  "badge",   // small square icon, e.g. a rank badge
  "button",  // a control in a toolbar
  "cell",    // one cell of a table or feed row: fills its column
  "chip",    // pill-shaped tag
  "heading", // a card title or a stat value
  "label",   // a short line of muted text
  "text",    // a full-width line
  "title",   // a display-size name
];

// A skeleton reads as a loader only where the content it replaces will land, so
// the frame takes the real container's own class instead of wrapping the tiles
// in a box with sizes of its own. Page-level skeletons compose it in
// component/skeletons/.
export const SkeletonFrame = ({ label, className = "", children }) => (
  <div className={className} role="status" aria-busy="true">
    {children}
    <span className="sr-only">{label}</span>
  </div>
);

// For a generic shape. Where a real element already sizes its own box -- the
// replay stage, a rank badge -- the placeholder wears that element's class
// instead: `<span className="skeleton replay-stage__layer" aria-hidden />`.
export const SkeletonTile = ({ variant = "text" }) => (
  <span className={`skeleton skeleton--${variant}`} aria-hidden="true" />
);

export { SKELETON_VARIANTS };
