// Keeps a census run alive after the request that asked for it is gone.
//
// A run takes the better part of an hour. Render's proxy closes an HTTP
// connection long before that -- the first scheduled run came back a 502 at
// thirty minutes and stored nothing -- so the run cannot be the response. The
// request starts it and is answered immediately; the caller polls for the
// outcome.
//
// Two rules carry the weight here. Nothing awaits the run, so an escaping
// rejection would reach Node's unhandled-rejection handler and take the API
// down: every failure is caught and turned into a status. And only one run may
// be in flight, because two would spend the day's PUBG quota twice over for the
// same rows.

const createRunner = ({ collect, now = Date.now } = {}) => {
  let counter = 0;
  let current = null;
  let last = null;

  const snapshot = () => {
    if (current) {
      return {
        state: "running",
        runId: current.runId,
        startedAt: current.startedAt,
        progress: { ...current.progress },
      };
    }
    if (last) return { ...last, progress: { ...last.progress } };
    return { state: "idle", runId: null, startedAt: null, progress: {} };
  };

  const start = (options = {}) => {
    if (current) {
      return { started: false, reason: "already running", runId: current.runId };
    }

    counter += 1;
    const run = {
      runId: `run-${counter}`,
      startedAt: now(),
      progress: {},
    };
    current = run;

    const done = (async () => {
      try {
        const result = await collect({
          ...options,
          onProgress: (progress) => {
            run.progress = { ...run.progress, ...progress };
          },
        });
        last = { state: "done", runId: run.runId, startedAt: run.startedAt,
          finishedAt: now(), progress: run.progress, result };
      } catch (error) {
        last = { state: "error", runId: run.runId, startedAt: run.startedAt,
          finishedAt: now(), progress: run.progress, message: error.message };
      } finally {
        current = null;
      }
    })();

    return { started: true, runId: run.runId, done };
  };

  return { start, status: snapshot };
};

module.exports = { createRunner };
