const LANG_TO_LOCALE = {
  en: "en-US",
  ua: "uk-UA",
};

const DEFAULT_LOCALE = LANG_TO_LOCALE.en;

export const getCurrentLocale = () => {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const lang = window.localStorage?.getItem("lang");
    return LANG_TO_LOCALE[lang] || DEFAULT_LOCALE;
  } catch (_e) {
    return DEFAULT_LOCALE;
  }
};
