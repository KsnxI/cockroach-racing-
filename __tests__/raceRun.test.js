const request = require('supertest');
const app = require('../src/app');
const { setupRace } = require('./helpers');

describe('Race run', () => {
  test('игрок не может запустить заезд: 403', async () => {
    const { p1, raceId } = await setupRace();
    const res = await request(app).post(`/races/${raceId}/run`).set(p1.auth);
    expect(res.status).toBe(403);
  });

  test('заезд без открытых ставок запустить нельзя: 409', async () => {
    const { bookie, raceId } = await setupRace({ open: false });
    const res = await request(app).post(`/races/${raceId}/run`).set(bookie.auth);
    expect(res.status).toBe(409);
  });

  test('запуск: результат, раскрытый seed, честность подтверждена, ставки рассчитаны', async () => {
    const { bookie, p1, p2, raceId, e1, e2 } = await setupRace();
    await request(app).post('/bets').set(p1.auth).send({ entryId: e2, amount: 100 });
    await request(app).post('/bets').set(p2.auth).send({ entryId: e1, amount: 100 });

    const res = await request(app).post(`/races/${raceId}/run`).set(bookie.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.standings).toHaveLength(2);
    expect(res.body.data.standings[0].position).toBe(1);
    expect(res.body.data.commentary.length).toBeGreaterThan(2);
    expect(res.body.data.seed).toBeDefined();
    expect(res.body.data.verification).toEqual({ seedMatchesHash: true, replayMatches: true });

    // ни одной ставки в статусе PENDING не осталось
    const pending = await request(app).get('/bets?status=PENDING').set(p1.auth);
    expect(pending.body.meta.total).toBe(0);

    // повторный запуск невозможен
    const again = await request(app).post(`/races/${raceId}/run`).set(bookie.auth);
    expect(again.status).toBe(409);

    // результат доступен всем авторизованным
    const result = await request(app).get(`/races/${raceId}/result`).set(p2.auth);
    expect(result.status).toBe(200);
  });
});