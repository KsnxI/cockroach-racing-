const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db');
const config = require('../src/config');
const { setupRace } = require('./helpers');

describe('Bets', () => {
  test('ставка списывает баланс и фиксирует коэффициент', async () => {
    const { p1, bookie, raceId, e2 } = await setupRace();
    const before = (await request(app).get('/auth/me').set(p1.auth)).body.data.balance;

    const res = await request(app).post('/bets').set(p1.auth).send({ entryId: e2, amount: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe(before - 100);
    expect(Number(res.body.data.bet.oddsAtBet)).toBe(1.8);

    // букмекер меняет коэффициент, но ставка игрока остаётся по старому
    await request(app)
      .patch(`/races/${raceId}/entries/${e2}/odds`)
      .set(bookie.auth)
      .send({ odds: 5 });
    const bet = await request(app).get(`/bets/${res.body.data.bet.id}`).set(p1.auth);
    expect(Number(bet.body.data.oddsAtBet)).toBe(1.8);
  });

  test('ставка на закрытый заезд: 409', async () => {
    const { p1, e2 } = await setupRace({ open: false });
    const res = await request(app).post('/bets').set(p1.auth).send({ entryId: e2, amount: 100 });
    expect(res.status).toBe(409);
  });

  test('ставка на своего таракана: 403', async () => {
    const { p1, e1 } = await setupRace();
    const res = await request(app).post('/bets').set(p1.auth).send({ entryId: e1, amount: 100 });
    expect(res.status).toBe(403);
  });

  test('недостаточно денег: 422', async () => {
    const { p1, e2 } = await setupRace();
    await prisma.user.update({ where: { id: p1.id }, data: { balance: config.minBet - 1 } });
    const res = await request(app).post('/bets').set(p1.auth).send({ entryId: e2, amount: config.minBet });
    expect(res.status).toBe(422);
  });

  test('сумма вне лимитов: 400', async () => {
    const { p1, e2 } = await setupRace();
    const res = await request(app)
      .post('/bets')
      .set(p1.auth)
      .send({ entryId: e2, amount: config.maxBet + 1 });
    expect(res.status).toBe(400);
  });

  test('букмекер не может делать ставки: 403', async () => {
    const { bookie, e2 } = await setupRace();
    const res = await request(app).post('/bets').set(bookie.auth).send({ entryId: e2, amount: 100 });
    expect(res.status).toBe(403);
  });

  test('чужую ставку посмотреть нельзя: 403, в списке её тоже нет', async () => {
    const { p1, p2, e2 } = await setupRace();
    const bet = await request(app).post('/bets').set(p1.auth).send({ entryId: e2, amount: 100 });
    const id = bet.body.data.bet.id;

    const foreign = await request(app).get(`/bets/${id}`).set(p2.auth);
    expect(foreign.status).toBe(403);
    const list = await request(app).get('/bets').set(p2.auth);
    expect(list.body.meta.total).toBe(0);
  });
});