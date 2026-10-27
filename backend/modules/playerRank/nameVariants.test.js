const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nameVariants } = require("./nameVariants");

// Every pair is the shape of a real failed search from GA4 (21-26 Oct 2026)
// whose player was found one variant away; the names themselves are made up.
const RESCUED = [
  ["Flint3", "flint3", "first letter typed upper"],
  ["Brokcu", "brokcu", "first letter typed upper"],
  ["shadow44", "Shadow44", "first letter typed lower"],
  ["dskss", "DSKSS", "all caps typed lower"],
  ["Dskss", "DSKSS", "all caps typed capitalised"],
  ["Xerra-", "xerra-", "lower case with a trailing dash"],
  ["cheko_", "CHEKO_", "all caps with a trailing underscore"],
  ["golden_dog", "golden-dog", "underscore for a dash"],
  ["noise42_", "noise42-", "underscore for a dash at the end"],
  ["Bravo_exe", "bravo_exe", "first letter typed upper"],
  ["Bravo.exe", "bravo_exe", "a dot, which no PUBG name has"],
  ["bravo.exe", "bravo_exe", "a dot, which no PUBG name has"],
  ["BOTОKILLER_", "BOTOKILLER_", "a Cyrillic О among Latin letters"],
  ["ＩＮＳＡＮＥ", "INSANE", "fullwidth letters"],
  ["Kj_éla", "Kj_ela", "an accent PUBG names cannot carry"],
];

for (const [typed, real, why] of RESCUED) {
  test(`${typed} reaches ${real} (${why})`, () => {
    assert.ok(nameVariants(typed).includes(real), JSON.stringify(nameVariants(typed)));
  });
}

test("never more than ten, never the name itself, only characters a PUBG name can hold", () => {
  for (const [typed] of RESCUED) {
    const variants = nameVariants(typed);
    assert.ok(variants.length <= 10, `${typed}: ${variants.length}`);
    assert.ok(!variants.includes(typed), typed);
    assert.ok(variants.every((v) => /^[A-Za-z0-9_-]+$/.test(v)), JSON.stringify(variants));
    assert.equal(new Set(variants).size, variants.length, `${typed} repeats a variant`);
  }
});

test("the cleaned spelling is tried first", () => {
  assert.equal(nameVariants("BOTОKILLER_")[0], "BOTOKILLER_");
  assert.equal(nameVariants("Bravo.exe")[0], "Bravo_exe");
});

test("a name with nothing a PUBG name could hold yields nothing", () => {
  assert.deepEqual(nameVariants("ĦĦĦĦ"), []);
  assert.deepEqual(nameVariants(""), []);
  assert.deepEqual(nameVariants("   "), []);
});

test("variants never run past the sixteen characters a PUBG name allows", () => {
  assert.ok(nameVariants("abcdefghijklmn.op").every((v) => v.length <= 16));
});
