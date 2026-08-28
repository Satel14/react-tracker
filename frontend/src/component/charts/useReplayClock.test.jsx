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
  let captured = null;
  const Capture = () => {
    const clock = useReplayClock(100);
    captured = clock;
    return <span data-testid="speed">{clock.speed}</span>;
  };
  render(<Capture />);
  act(() => { captured.setSpeed(8); });
  expect(screen.getByTestId("speed")).toHaveTextContent("8");
  expect(captured.clockRef.current.speed).toBe(8);
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

test("keeps stable references for the returned callbacks across an unrelated re-render", () => {
  let captured = null;
  let forceRender = null;
  const Wrapper = () => {
    const [, setTick] = React.useState(0);
    captured = useReplayClock(100);
    forceRender = () => setTick((n) => n + 1);
    return null;
  };
  render(<Wrapper />);
  const first = {
    play: captured.play,
    pause: captured.pause,
    toggle: captured.toggle,
    seek: captured.seek,
    setSpeed: captured.setSpeed,
    publish: captured.publish,
  };
  act(() => { forceRender(); });
  expect(captured.play).toBe(first.play);
  expect(captured.pause).toBe(first.pause);
  expect(captured.toggle).toBe(first.toggle);
  expect(captured.seek).toBe(first.seek);
  expect(captured.setSpeed).toBe(first.setSpeed);
  expect(captured.publish).toBe(first.publish);
});
