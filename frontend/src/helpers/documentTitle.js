import { routeMetaFor } from "./routeMeta.js";
import { pageHeadMeta } from "./pageHeadMeta.js";

// The title a fresh load of this path would carry: the build writes it for a
// fixed route, the Pages Function for everything else -- both from these same
// tables, so a client-side visit can arrive at the identical tab.
export const titleFor = (pathname) => {
  const path = String(pathname || "").split("?")[0];
  return routeMetaFor(path)?.title || pageHeadMeta(path)?.title || null;
};

export default titleFor;
