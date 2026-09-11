import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
// `t` is imported, not built: react-switch-lang@1.0.2 exports a live-bound `t`
// and has no `getTranslate`. This is the pattern TierDistribution.test.jsx:3 and
// RankPercentile.test.jsx:4 already use.
import { setTranslations, setDefaultLanguage, setLanguage, t } from "react-switch-lang";
import en from "../../Language/en.json";
import RankPointsLookup from "./RankPointsLookup";

setTranslations({ en });
setDefaultLanguage("en");
setLanguage("en");

const table = Array.from({ length: 101 }, (_, i) => 100 - i);

describe("RankPointsLookup", () => {
  it("asks for a number before it says anything", () => {
    render(<RankPointsLookup t={t} table={table} />);
    expect(screen.getByText(/Enter your rank points/)).toBeInTheDocument();
  });

  it("places a number counted upwards", () => {
    render(<RankPointsLookup t={t} table={table} />);
    fireEvent.change(screen.getByLabelText(/Your rank points/), { target: { value: "50" } });
    expect(screen.getByText(/better than 50 out of 100/)).toBeInTheDocument();
  });

  // The quieter second clause, and only for small numbers: "top 97%" is not a
  // phrase anybody uses.
  it("adds the top-n form only up to fifty", () => {
    render(<RankPointsLookup t={t} table={table} />);
    fireEvent.change(screen.getByLabelText(/Your rank points/), { target: { value: "95" } });
    expect(screen.getByText(/top 5%/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Your rank points/), { target: { value: "10" } });
    expect(screen.queryByText(/top \d+%/)).toBeNull();
  });

  it("says nothing rather than something wrong for a non-number", () => {
    render(<RankPointsLookup t={t} table={table} />);
    fireEvent.change(screen.getByLabelText(/Your rank points/), { target: { value: "abc" } });
    expect(screen.getByText(/Enter your rank points/)).toBeInTheDocument();
    expect(screen.queryByText(/better than/)).toBeNull();
  });

  // A dead control is worse than no control: at launch there is no table.
  it("renders no control at all when there is no table", () => {
    const { container } = render(<RankPointsLookup t={t} table={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
