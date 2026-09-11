import React, { useState } from "react";
import { getLanguage } from "react-switch-lang";
import { canExportCensusChart } from "../../helpers/censusChart";

const CensusChartDownload = ({ data, t }) => {
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(false);
  if (!canExportCensusChart(data)) return null;

  const download = async (format) => {
    if (busy) return;
    const language = getLanguage();
    setBusy(format);
    setFailed(false);
    try {
      const { downloadCensusChart } = await import("../../helpers/downloadCensusChart");
      await downloadCensusChart(data, { t, language, format });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ranks-page__chart-download">
      <div className="ranks-page__chart-actions" aria-busy={Boolean(busy)}>
        <span>{t("pages.ranks.distribution.chart.downloadLabel")}</span>
        <button type="button" onClick={() => download("png")} disabled={Boolean(busy)} aria-label={t("pages.ranks.distribution.chart.downloadPng")}>
          PNG{busy === "png" ? "…" : ""}
        </button>
        <button type="button" onClick={() => download("svg")} disabled={Boolean(busy)} aria-label={t("pages.ranks.distribution.chart.downloadSvg")}>
          SVG{busy === "svg" ? "…" : ""}
        </button>
      </div>
      {failed && <p className="ranks-page__share-note" role="alert">{t("pages.ranks.distribution.chart.error")}</p>}
    </div>
  );
};

export default CensusChartDownload;
