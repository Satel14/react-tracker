import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ErrorPage from "./ErrorPage";

test("the not-found page returns to the homepage through the active router", () => {
  render(
    <MemoryRouter initialEntries={["/missing"]}>
      <Routes>
        <Route path="/" element={<h1>Home destination</h1>} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("heading", { name: "Home destination" })).toBeInTheDocument();
});
