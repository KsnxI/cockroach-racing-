const { seedToInt, mulberry32 } = require('../utils/rng');

const TRACK = 1000;
const MAX_TICKS = 5000;

const BURST = [
  '{n} делает рывок и вырывается вперёд!',
  '{n} поймал попутный сквозняк!',
  '{n} включает турбо!',
];
const STUMBLE = [
  '{n} споткнулся о крошку!',
  '{n} запутался в усах!',
  '{n} засмотрелся на сыр и потерял время.',
];
const LEAD = [
  '{n} выходит в лидеры!',
  'Смена лидера: теперь впереди {n}!',
  '{n} обходит соперников!',
];

// выбор фразы без участия ГСЧ, чтобы не сбивать последовательность случайных чисел
const pick = (arr, tick, name) => arr[(tick + name.length) % arr.length].replace('{n}', name);

// entries: [{ id, name, speed, stamina, luck }]
// возвращает { results: [{ entryId, position, finishTime }], lines: [строки комментария] }
function simulate(entries, seed) {
  const rnd = mulberry32(seedToInt(seed));
  // фиксируем порядок, чтобы результат не зависел от порядка записей в БД
  const racers = [...entries]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => ({ ...e, pos: 0, finishAt: null }));

  const lines = [];
  const say = (tick, text) => lines.push(`Тик ${tick}: ${text}`);
  say(0, `Старт! На дорожке: ${racers.map((r) => r.name).join(', ')}.`);

  let leaderId = null;
  let lastTick = 0;

  for (let tick = 1; tick <= MAX_TICKS && racers.some((r) => r.finishAt === null); tick++) {
    lastTick = tick;
    for (const r of racers) {
      if (r.finishAt !== null) continue;

      //три случайных числа за ход
      const burst = rnd() < r.luck / 400;
      const stumble = rnd() < 0.03;
      const jitter = 0.8 + rnd() * 0.4;

      const fatigue = Math.min(0.5, tick * 0.0015 * (1 - r.stamina / 200));
      const step = stumble ? 0 : (10 + r.speed) * jitter * (burst ? 1.5 : 1) * (1 - fatigue);

      const prev = r.pos;
      r.pos += step;

      if (stumble) say(tick, pick(STUMBLE, tick, r.name));
      else if (burst) say(tick, pick(BURST, tick, r.name));

      if (r.pos >= TRACK) {
        //точное время пересечения черты,
        r.finishAt = tick - 1 + (TRACK - prev) / step;
        say(tick, `${r.name} пересекает финишную черту!`);
      }
    }

    //смена лидера среди тех, кто ещё не финишировал
    const running = racers.filter((r) => r.finishAt === null);
    if (running.length > 0) {
      const lead = running.reduce((a, b) => (b.pos > a.pos ? b : a));
      if (lead.id !== leaderId) {
        if (leaderId !== null) say(tick, pick(LEAD, tick, lead.name));
        leaderId = lead.id;
      }
    }
  }

  const timeOf = (r) => (r.finishAt !== null ? r.finishAt : MAX_TICKS + (TRACK - r.pos) / 10);
  const ranked = [...racers].sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : 1));

  say(lastTick, `Победитель: ${ranked[0].name}!`);

  const results = ranked.map((r, i) => ({
    entryId: r.id,
    position: i + 1,
    finishTime: Math.round(timeOf(r) * 100),
  }));

  return { results, lines };
}

module.exports = { simulate };