import { readStoredItem } from "./browserStorage";

const LANG_TO_LOCALE = {
  en: "en-US",
  ua: "uk-UA",
};

const DEFAULT_LOCALE = LANG_TO_LOCALE.en;

export const getCurrentLocale = () => {
  const lang = readStoredItem("lang");
  return LANG_TO_LOCALE[lang] || DEFAULT_LOCALE;
};
