// Which language a page opens in, given where the visitor is and what they
// chose last time. Pure, so the rule can be read and tested without a browser.
//
// The URL wins when it names a language: /ua/ranks exists because someone
// searched in Ukrainian and clicked a Ukrainian result, and a preference set
// on some other visit must not overrule that.
import { languageForPath } from "../helpers/routeMeta";

export const LANGUAGES = ["en", "ua"];
export const DEFAULT_LANGUAGE = "en";

export const chooseLanguage = ({ pathname, stored }) =>
  languageForPath(pathname) ||
  (LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE);

export default chooseLanguage;
