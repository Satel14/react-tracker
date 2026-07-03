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
