import { RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT, seasonRecapFilename, seasonRecapSvg } from "./seasonRecapCard";
import { downloadSvg } from "./downloadSvg";

export const downloadSeasonRecap = async (recap, { t, language, playerName, platform, percentile }) => {
  await downloadSvg(seasonRecapSvg(recap, { t, language, playerName, platform, percentile }), {
    width: RECAP_CARD_WIDTH,
    height: RECAP_CARD_HEIGHT,
    filename: seasonRecapFilename(recap, playerName, language),
    format: "png",
  });
};
