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

module.exports = { shuffledCopy };
