import { RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT, seasonRecapFilename, seasonRecapSvg } from "./seasonRecapCard";
import { rankIconDataUrl } from "./rankIconDataUrl";
import { downloadSvg } from "./downloadSvg";

export const downloadSeasonRecap = async (recap, { t, language, playerName, platform, percentile }) => {
  // No icon is better than no image: a failed read leaves the tier as text.
  const rankIcon = await rankIconDataUrl(recap.iconUrl);
  await downloadSvg(seasonRecapSvg(recap, { t, language, playerName, platform, percentile, rankIcon }), {
    width: RECAP_CARD_WIDTH,
    height: RECAP_CARD_HEIGHT,
    filename: seasonRecapFilename(recap, playerName, language),
    format: "png",
  });
};
