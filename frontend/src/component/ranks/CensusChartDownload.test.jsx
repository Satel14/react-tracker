import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, setLanguage, t } from "react-switch-lang";
import CensusChartDownload from "./CensusChartDownload";
import { downloadCensusChart } from "../../helpers/downloadCensusChart";
import en from "../../Language/en.json";
import ua from "../../Language/ua.json";

vi.mock("../../helpers/downloadCensusChart", () => ({ downloadCensusChart: vi.fn() }));
const data = {
  seasonId: "division.bro.official.pc-2018-42", shard: "steam", current: false,
  accounts: 1000, matches: 80, firstDate: "2026-09-01", lastDate: "2026-09-07",
  tiers: [{ tier: "gold", publishable: true, share: 0.3, low: 0.28, high: 0.34 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("en");
});
afterEach(() => setLanguage("en"));

it("exports the displayed reading, including a replacement live reading", async () => {
  const { rerender } = render(<CensusChartDownload data={data} t={t} />);
  const fresh = { ...data, accounts: 1200, lastDate: "2026-09-08" };
  rerender(<CensusChartDownload data={fresh} t={t} />);
  fireEvent.click(screen.getByRole("button", { name: "Download chart (PNG)" }));
  await waitFor(() => expect(downloadCensusChart).toHaveBeenCalledWith(fresh, { t, language: "en", format: "png" }));
});

it("uses the selected language for the download", async () => {
  setLanguage("ua");
  render(<CensusChartDownload data={data} t={t} />);
  fireEvent.click(screen.getByRole("button", { name: "Завантажити графік (SVG)" }));
  await waitFor(() => expect(downloadCensusChart).toHaveBeenCalledWith(data, { t, language: "ua", format: "svg" }));
});

it("leaves gathering states without download controls", () => {
  render(<CensusChartDownload data={{ ...data, tiers: [] }} t={t} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("reports a failed download and allows another attempt", async () => {
  downloadCensusChart.mockRejectedValueOnce(new Error("canvas failed"));
  render(<CensusChartDownload data={data} t={t} />);
  fireEvent.click(screen.getByRole("button", { name: "Download chart (PNG)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(en.pages.ranks.distribution.chart.error);
  fireEvent.click(screen.getByRole("button", { name: "Download chart (SVG)" }));
  await waitFor(() => expect(downloadCensusChart).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
