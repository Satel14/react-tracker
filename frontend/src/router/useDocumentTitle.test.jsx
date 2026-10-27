import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { useDocumentTitle } from "./useDocumentTitle";

const Probe = () => {
  useDocumentTitle(useLocation().pathname);
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/player/steam/PlayerB")}>b</button>
      <button type="button" onClick={() => navigate("/ranks")}>ranks</button>
    </>
  );
};

// The server titles the first page only; every visit after that is client-side
// and used to keep the first page's title -- one player's name on another
// player's profile.
test("the tab follows client-side navigation", () => {
  document.title = "PlayerA - PUBG stats, ranked RP and match history";
  const { getByText } = render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Probe />
    </MemoryRouter>
  );
  expect(document.title).toBe("PlayerA - PUBG stats, ranked RP and match history");

  fireEvent.click(getByText("b"));
  expect(document.title).toBe("PlayerB - PUBG stats, ranked RP and match history");

  fireEvent.click(getByText("ranks"));
  expect(document.title).toMatch(/^PUBG Ranks Explained/);
});
