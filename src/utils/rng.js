const crypto = require('crypto');

//превращается в 32-битное число
function seedToInt(seed) {
  return crypto.createHash('sha256').update(seed).digest().readUInt32BE(0);
}

//аленький быстрый ГСЧ, при одинаковом числе даёт одинаковую последовательность
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { seedToInt, mulberry32 };