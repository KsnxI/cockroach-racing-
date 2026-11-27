const { simulate } = require('../src/workers/simulate');

const entries = [
  { id: 'a', name: 'Пират', speed: 20, stamina: 10, luck: 10 },
  { id: 'b', name: 'Крошка', speed: 15, stamina: 30, luck: 20 },
  { id: 'c', name: 'Шустрик', speed: 10, stamina: 10, luck: 50 },
];

describe('simulate', () => {
  test('одинаковый seed даёт одинаковый результат', () => {
    expect(simulate(entries, 'seed-123')).toEqual(simulate(entries, 'seed-123'));
  });

  test('результат не зависит от порядка участников', () => {
    const reversed = [...entries].reverse();
    expect(simulate(reversed, 'seed-123').results).toEqual(simulate(entries, 'seed-123').results);
  });

  test('позиции 1..N без повторов и комментарий не пустой', () => {
    const { results, lines } = simulate(entries, 'another-seed');
    expect(results.map((r) => r.position).sort()).toEqual([1, 2, 3]);
    expect(lines.length).toBeGreaterThan(2);
  });
});