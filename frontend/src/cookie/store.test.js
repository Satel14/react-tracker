import { addHistory, getFavorites, getHistory, toggleFavorite } from "./store";

beforeEach(() => {
  window.localStorage.clear();
});

test("interleaved addHistory calls keep every write (no lost update)", async () => {
  await Promise.all([
    addHistory("steam", "alpha", "Alpha"),
    addHistory("steam", "bravo", "Bravo"),
    addHistory("steam", "charlie", "Charlie"),
  ]);

  const history = await getHistory();
  expect(Object.keys(history).sort()).toEqual([
    "steam:alpha",
    "steam:bravo",
    "steam:charlie",
  ]);
});

test("interleaved toggleFavorite calls keep every write (no lost update)", async () => {
  await Promise.all([
    toggleFavorite({ accountId: "account.alpha", nickname: "Alpha", platform: "steam" }),
    toggleFavorite({ accountId: "account.bravo", nickname: "Bravo", platform: "steam" }),
    toggleFavorite({ accountId: "account.charlie", nickname: "Charlie", platform: "steam" }),
  ]);

  const favorites = await getFavorites();
  expect(Object.keys(favorites).sort()).toEqual([
    "account.alpha",
    "account.bravo",
    "account.charlie",
  ]);
});

test("getHistory drops entries whose nickname and gameId are both account ids and persists the cleanup", async () => {
  const bogusKey = "steam:account.fa405e76bea343a59dc8bc4d3cece7a6";
  window.localStorage.setItem(
    "history",
    JSON.stringify({
      [bogusKey]: {
        id: bogusKey,
        gameId: "account.fa405e76bea343a59dc8bc4d3cece7a6",
        platform: "steam",
        nickname: "account.fa405e76bea343a59dc8bc4d3cece7a6",
        searchedAt: 1,
      },
      "steam:Neo": { id: "steam:Neo", gameId: "Neo", platform: "steam", nickname: "Neo", searchedAt: 2 },
    })
  );

  const history = await getHistory();

  expect(Object.keys(history)).toEqual(["steam:Neo"]);
  expect(JSON.parse(window.localStorage.getItem("history"))).not.toHaveProperty(bogusKey);
});

test("getHistory keeps entries whose gameId is a proper handle even when the nickname is account-like", async () => {
  window.localStorage.setItem(
    "history",
    JSON.stringify({
      "steam:Trinity": {
        id: "steam:Trinity",
        gameId: "Trinity",
        platform: "steam",
        nickname: "account.aaaabbbbccccddddeeeeffff00001111",
        searchedAt: 1,
      },
    })
  );

  const history = await getHistory();

  expect(Object.keys(history)).toEqual(["steam:Trinity"]);
  expect(JSON.parse(window.localStorage.getItem("history"))).toHaveProperty("steam:Trinity");
});
