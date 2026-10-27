import { useEffect } from "react";
import { titleFor } from "../helpers/documentTitle";

// The server titles the first page only. Every visit after it happens in the
// browser, and without this the tab kept the first page's title for good.
export const useDocumentTitle = (pathname) => {
  useEffect(() => {
    const title = titleFor(pathname);
    if (title) document.title = title;
  }, [pathname]);
};

export default useDocumentTitle;
