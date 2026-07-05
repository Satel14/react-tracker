import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

test("pans the viewport on a single-pointer drag (mouse or touch)", () => {
  const { container } = render(
    <MapField rawMapName="Baltic_Main">
      <div data-testid="overlay">x</div>
    </MapField>
  );
  const stage = container.querySelector(".map-field");
  const viewport = container.querySelector(".map-field__viewport");

  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 140, clientY: 130 });

  expect(viewport.style.transform).toContain("translate(40px, 30px)");
});
