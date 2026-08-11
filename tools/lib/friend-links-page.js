'use strict';

function shuffledCopy(items, random = Math.random) {
  const result = Array.isArray(items) ? items.slice() : [];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    result[index] = result[randomIndex];
    result[randomIndex] = current;
  }
  return result;
}

function seedNumber(value) {
  const numeric = String(value || '').trim();
  if (/^\d+$/.test(numeric)) return Number(BigInt(numeric) % 4_294_967_295n);

  let hash = 2_166_136_261;
  for (const character of numeric) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededRandom(value) {
  let state = seedNumber(value) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffledForBuild(items, buildNumber) {
  const result = Array.isArray(items) ? items.slice() : [];
  if (result.length < 2) return result;

  const firstIndex = seedNumber(buildNumber) % result.length;
  const [first] = result.splice(firstIndex, 1);
  return [first, ...shuffledCopy(result, seededRandom(buildNumber))];
}

module.exports = { shuffledCopy, shuffledForBuild };
