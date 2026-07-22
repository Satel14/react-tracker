const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  addRecentSearch,
  getRecentSearches,
  __setRecentSearchesFile,
} = require("./index");

let tmpFile;
let savedDatabaseUrl;

beforeEach(() => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL; // force the file-store path
  tmpFile = path.join(
    os.tmpdir(),
    `recent-searches-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
  __setRecentSearchesFile(tmpFile);
});

afterEach(async () => {
  if (savedDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = savedDatabaseUrl;
  }
  __setRecentSearchesFile(null); // restore the production target
  await fs.rm(tmpFile, { force: true });
});

test("writes to a temp file then renames onto the target (atomic swap)", async () => {
  const writeArgs = [];
  const renameArgs = [];
  const realWrite = fs.writeFile;
  const realRename = fs.rename;
  fs.writeFile = async (...args) => {
    writeArgs.push(args);
    return realWrite(...args);
  };
  fs.rename = async (...args) => {
    renameArgs.push(args);
    return realRename(...args);
  };
  try {
    await addRecentSearch({ gameId: "Neo", platform: "steam" });

    assert.equal(renameArgs.length, 1, "expected exactly one fs.rename (atomic swap)");
    assert.notEqual(writeArgs[0][0], tmpFile, "must not write directly onto the target file");
    assert.equal(renameArgs[0][1], tmpFile, "must rename the temp file onto the target");

    const parsed = JSON.parse(await fs.readFile(tmpFile, "utf8"));
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].id, "steam:Neo");
  } finally {
    fs.writeFile = realWrite;
    fs.rename = realRename;
  }
});

test("getRecentSearches waits for an in-flight write instead of reading a stale/torn file", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const realWrite = fs.writeFile;
  fs.writeFile = async (...args) => {
    await gate; // hold the write open
    return realWrite(...args);
  };
  try {
    const writeP = addRecentSearch({ gameId: "Neo", platform: "steam" });
    const readP = getRecentSearches(10);

    // Give an unserialized (buggy) read time to resolve against the not-yet-written file.
    await new Promise((resolve) => setTimeout(resolve, 25));
    release();

    const [, records] = await Promise.all([writeP, readP]);
    assert.equal(records.length, 1, "read must observe the completed write, not a stale/empty file");
    assert.equal(records[0].gameId, "Neo");
  } finally {
    fs.writeFile = realWrite;
  }
});

test("N concurrent addRecentSearch calls keep the file valid with no lost updates", async () => {
  const n = 15;
  const entries = Array.from({ length: n }, (_, i) => ({
    gameId: `Player${i}`,
    platform: "steam",
  }));

  await Promise.all(entries.map((entry) => addRecentSearch(entry)));

  const raw = await fs.readFile(tmpFile, "utf8");
  const parsed = JSON.parse(raw); // throws if the file was left torn/invalid
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, n);

  const ids = new Set(parsed.map((item) => item.id));
  for (let i = 0; i < n; i += 1) {
    assert.ok(ids.has(`steam:Player${i}`), `lost update: missing steam:Player${i}`);
  }
});
