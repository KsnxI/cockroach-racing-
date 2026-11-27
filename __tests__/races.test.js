const request = require('supertest');
const app = require('../src/app');
const { registerUser, createBookmaker } = require('./helpers');

const future = () => new Date(Date.now() + 3600e3).toISOString();

describe('Races', () => {
  test('игрок не может создать заезд: 403, букмекер может: 201', async () => {
    const player = await registerUser();
    const bookie = await createBookmaker();

    const denied = await request(app).post('/races').set(player.auth).send({ title: 'Кубок', startsAt: future() });
    expect(denied.status).toBe(403);

    const ok = await request(app).post('/races').set(bookie.auth).send({ title: 'Кубок', startsAt: future() });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('SCHEDULED');
    expect(ok.body.data.seed).toBeUndefined(); // seed скрыт до финиша
  });

  test('заезд в прошлом: 400', async () => {
    const bookie = await createBookmaker();
    const res = await request(app)
      .post('/races')
      .set(bookie.auth)
      .send({ title: 'Кубок', startsAt: '2020-01-01T00:00:00Z' });
    expect(res.status).toBe(400);
  });

  test('чужой букмекер не может менять заезд: 403', async () => {
    const b1 = await createBookmaker();
    const b2 = await createBookmaker();
    const race = await request(app).post('/races').set(b1.auth).send({ title: 'Кубок', startsAt: future() });
    const res = await request(app)
      .patch(`/races/${race.body.data.id}`)
      .set(b2.auth)
      .send({ title: 'Взлом заезда' });
    expect(res.status).toBe(403);
  });

  test('список: фильтр по статусу и пагинация', async () => {
    const bookie = await createBookmaker();
    for (const title of ['Кубок 1', 'Кубок 2']) {
      await request(app).post('/races').set(bookie.auth).send({ title, startsAt: future() });
    }
    const res = await request(app).get('/races?status=SCHEDULED&limit=1').set(bookie.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  test('лидерборд возвращает топы тараканов и игроков', async () => {
    const user = await registerUser();
    const res = await request(app).get('/stats/leaderboard').set(user.auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.racers)).toBe(true);
    expect(Array.isArray(res.body.data.players)).toBe(true);
  });
});