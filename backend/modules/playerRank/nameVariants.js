// Spellings worth trying when a nickname is not found. PUBG name lookups are
// case-sensitive and a name holds only Latin letters, digits, "_" and "-", up
// to 16 characters; the failed searches this answers were capitals typed the
// other way, a dot for "_" or "-", the two swapped, and letters pasted from
// other alphabets. Ten is the most names one players request takes.
const MAX_VARIANTS = 10;
const PUBG_NAME = /^[A-Za-z0-9_-]{2,16}$/;

// Cyrillic letters that render the same as Latin ones.
const LOOKALIKES = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", І: "I",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i",
};

const clean = (raw) =>
  raw
    .normalize("NFKC")
    .replace(/[^ -~]/g, (character) => LOOKALIKES[character] ?? character)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const caseForms = (base) => [
  base,
  base.toLowerCase(),
  base.charAt(0).toUpperCase() + base.slice(1).toLowerCase(),
  base.toUpperCase(),
  base.charAt(0).toUpperCase() + base.slice(1),
  base.charAt(0).toLowerCase() + base.slice(1),
];

function nameVariants(raw) {
  const typed = String(raw || "").trim();
  if (!typed) return [];
  const cleaned = clean(typed);
  const bases = [
    cleaned,
    cleaned.replace(/\./g, "_"),
    cleaned.replace(/\./g, "-"),
    cleaned.replace(/\./g, ""),
    cleaned.replace(/_/g, "-"),
    cleaned.replace(/-/g, "_"),
    cleaned.replace(/^[_-]+|[_-]+$/g, ""),
  ];

  const variants = [];
  for (const base of bases) {
    for (const candidate of caseForms(base)) {
      if (candidate !== typed && PUBG_NAME.test(candidate) && !variants.includes(candidate)) {
        variants.push(candidate);
      }
    }
  }
  return variants.slice(0, MAX_VARIANTS);
}

module.exports = { nameVariants, MAX_VARIANTS };
