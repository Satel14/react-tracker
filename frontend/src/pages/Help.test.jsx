import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Help from "./Help";
import { ROUTE_META } from "../helpers/routeMeta";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const renderPage = () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  return render(<Help />);
};

afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

const faq = () => Object.values(en.pages.help.faq);

// The defect this file exists for. antd's Collapse hands rc-collapse a closed
// panel, and rc-collapse renders its content as null -- so every answer on this
// page existed only after a click. Not in the DOM, not findable with Ctrl+F,
// and not readable by anything that renders the page and reads what it finds.
// Google's answer was to snippet the site footer for this URL instead.
test("has every answer in the document before anything is clicked", () => {
  const { container } = renderPage();
  for (const { a } of faq()) {
    expect(container.textContent, a.slice(0, 40)).toContain(a);
  }
});

// By position in the rendered text rather than by role: antd's collapse header
// is not exposed as a button, and FAQ_KEYS in Help.jsx is a second list that
// can drift from the dictionary's order -- which is the thing worth pinning.
test("asks every question the copy defines, in the copy's order", () => {
  const { container } = renderPage();
  const positions = faq().map(({ q }) => container.textContent.indexOf(q));
  expect(positions.filter((at) => at < 0)).toEqual([]);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});

// The same discipline /ranks and /leaderboards follow: the shell writes
// routeMeta's h1 and intro into #root, React replaces the whole mount point,
// and if the two disagree then a crawler reads one page and a visitor sees
// another. This page used to render "Help & FAQ" over a shell saying "How to
// look up PUBG stats".
test("renders the same h1 and intro the prerendered shell injects", () => {
  renderPage();
  const meta = ROUTE_META.find((route) => route.path === "/help");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(meta.h1);
  expect(screen.getByText(meta.intro)).toBeInTheDocument();
});

describe("the search box", () => {
  const type = (value) =>
    fireEvent.change(screen.getByPlaceholderText(en.pages.help.searchPlaceholder), {
      target: { value },
    });

  it("narrows to the questions that match", () => {
    renderPage();
    type("avatar");
    expect(screen.getByText(en.pages.help.faq.avatar.q)).toBeInTheDocument();
    expect(screen.queryByText(en.pages.help.faq.platforms.q)).not.toBeInTheDocument();
  });

  // Searching only the questions would miss most of what is written here: the
  // word a player types is usually in the answer.
  it("matches words that appear only in an answer", () => {
    renderPage();
    type("fourteen days");
    expect(screen.getByText(en.pages.help.faq.history.q)).toBeInTheDocument();
    expect(screen.queryByText(en.pages.help.faq.search.q)).not.toBeInTheDocument();
  });

  it("says so rather than showing an empty page", () => {
    renderPage();
    type("zzzzz");
    expect(screen.getByText(en.pages.help.empty)).toBeInTheDocument();
  });
});

test("answers in Ukrainian too", () => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("ua");
  const { container } = render(<Help />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ua.pages.help.title);
  expect(container.textContent).toContain(ua.pages.help.faq.history.a);
  expect(container.textContent).not.toContain(en.pages.help.faq.history.a);
});
