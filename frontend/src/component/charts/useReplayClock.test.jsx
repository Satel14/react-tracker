import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useReplayClock } from "./useReplayClock";

const Harness = () => {
  const clock = useReplayClock(100);
  return (
    <div>
      <span data-testid="t">{clock.displayT}</span>
      <span data-testid="playing">{String(clock.playing)}</span>
      <span data-testid="speed">{clock.speed}</span>
      <button onClick={clock.toggle}>toggle</button>
      <button onClick={() => clock.seek(42)}>seek</button>
      <button onClick={() => clock.setSpeed(8)}>faster</button>
      <span data-testid="core">{String(!!clock.clockRef.current)}</span>
    </div>
  );
};

test("exposes a stable core through clockRef", () => {
  render(<Harness />);
  expect(screen.getByTestId("core")).toHaveTextContent("true");
});

test("toggle flips playing without advancing the display clock", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByTestId("playing")).toHaveTextContent("true");
  expect(screen.getByTestId("t")).toHaveTextContent("0");
});

test("seek publishes the new time and pauses", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("toggle"));
  fireEvent.click(screen.getByText("seek"));
  expect(screen.getByTestId("t")).toHaveTextContent("42");
  expect(screen.getByTestId("playing")).toHaveTextContent("false");
});

test("setSpeed is reflected in state and on the core", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("faster"));
  expect(screen.getByTestId("speed")).toHaveTextContent("8");
});

test("publishes the core time when asked to", () => {
  let captured = null;
  const Capture = () => {
    const clock = useReplayClock(100);
    captured = clock;
    return <span data-testid="t">{clock.displayT}</span>;
  };
  render(<Capture />);
  act(() => {
    captured.clockRef.current.seek(7);
    captured.publish();
  });
  expect(screen.getByTestId("t")).toHaveTextContent("7");
});

test("keeps the same core across a duration change", () => {
  let captured = null;
  const Wrapper = ({ duration }) => {
    captured = useReplayClock(duration);
    return null;
  };
  const { rerender } = render(<Wrapper duration={100} />);
  const first = captured.clockRef.current;
  rerender(<Wrapper duration={50} />);
  expect(captured.clockRef.current).toBe(first);
});

test("clamps displayT when duration shrinks below the current position", () => {
  let captured = null;
  const Wrapper = ({ duration }) => {
    captured = useReplayClock(duration);
    return <span data-testid="t">{captured.displayT}</span>;
  };
  const { rerender } = render(<Wrapper duration={100} />);
  act(() => { captured.seek(80); });
  rerender(<Wrapper duration={50} />);
  expect(screen.getByTestId("t")).toHaveTextContent("50");
});
