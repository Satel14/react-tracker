import { CENSUS_CHART_WIDTH, CENSUS_CHART_HEIGHT, censusChartFilename, censusChartSvg } from "./censusChart";
import { downloadSvg } from "./downloadSvg";

export const downloadCensusChart = async (data, { t, language, format }) => {
  if (format !== "png" && format !== "svg") throw new Error("Unsupported chart format");
  await downloadSvg(censusChartSvg(data, { t, language }), {
    width: CENSUS_CHART_WIDTH,
    height: CENSUS_CHART_HEIGHT,
    filename: censusChartFilename(data, language, format),
    format,
  });
};
