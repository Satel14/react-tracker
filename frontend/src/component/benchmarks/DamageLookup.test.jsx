import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DamageLookup from "./DamageLookup";

const tier = (name, mean) => ({ tier: name, publishable: true, metrics: { damage: { mean } } });

const rows = [tier("silver", 142), tier("gold", 171), tier("platinum", 204), tier("crystal", 238)];
const t = (key) => key;

it("names the two tier averages a number sits between", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "215");
  const answer = screen.getByTestId("lookup-answer");
  expect(answer).toHaveTextContent("platinum");
  expect(answer).toHaveTextContent("crystal");
  expect(answer).not.toHaveTextContent("gold");
});

it("says so rather than naming a tier above every average measured", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "400");
  const answer = screen.getByTestId("lookup-answer");
  expect(answer).toHaveTextContent("pages.statsByRank.lookup.above");
  expect(answer).toHaveTextContent("crystal");
});

it("says so rather than naming a tier below every average measured", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "40");
  const answer = screen.getByTestId("lookup-answer");
  expect(answer).toHaveTextContent("pages.statsByRank.lookup.below");
  expect(answer).toHaveTextContent("silver");
});

it("names one tier when the number equals its average exactly", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "171");
  expect(screen.getByTestId("lookup-answer")).toHaveTextContent("pages.statsByRank.lookup.at");
});

// The page must not read as if it knew what is typical for a player. It
// compares against averages and says so -- the distribution of players within a
// tier is not published, and no wording here may imply it is.
it("claims nothing about what is typical", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "215");
  expect(screen.getByTestId("lookup-answer").textContent).not.toMatch(/typical|normal/i);
});

it("answers nothing until a number is entered", () => {
  render(<DamageLookup rows={rows} t={t} />);
  expect(screen.queryByTestId("lookup-answer")).not.toBeInTheDocument();
});

// The note is what stops the control being read as "which tier am I". It is
// rendered before anyone types, not as a footnote to an answer.
it("states what the comparison is, before and after an answer", async () => {
  render(<DamageLookup rows={rows} t={t} />);
  expect(screen.getByText("pages.statsByRank.lookup.note")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("spinbutton"), "215");
  expect(screen.getByText("pages.statsByRank.lookup.note")).toBeInTheDocument();
});

it("orders by the measured average rather than trusting the row order", async () => {
  render(<DamageLookup rows={[...rows].reverse()} t={t} />);
  await userEvent.type(screen.getByRole("spinbutton"), "215");
  const answer = screen.getByTestId("lookup-answer");
  expect(answer).toHaveTextContent("platinum");
  expect(answer).toHaveTextContent("crystal");
});
