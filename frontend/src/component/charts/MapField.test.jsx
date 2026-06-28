import React from "react";
import { render, screen } from "@testing-library/react";
import MapField, { clampZoom } from "./MapField";

test("clampZoom keeps zoom within bounds", () => {
  expect(clampZoom(0.2)).toBe(1);
  expect(clampZoom(99)).toBe(6);
  expect(clampZoom(2.5)).toBe(2.5);
});

test("renders the map image for the given map", () => {
  render(<MapField rawMapName="Baltic_Main" />);
  const img = screen.getByRole("img", { name: /erangel/i });
  expect(img).toBeInTheDocument();
});

test("renders overlay children", () => {
  render(
    <MapField rawMapName="Baltic_Main">
      <div data-testid="overlay">x</div>
    </MapField>
  );
  expect(screen.getByTestId("overlay")).toBeInTheDocument();
});
